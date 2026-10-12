import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  encodeAbiParameters,
  keccak256,
  stringToHex,
  parseAbiParameters,
} from 'viem';
import { MandateManagerABI } from './abi.js';
import type {
  AllowedTarget,
  CreateMandateParams,
  CreateMandateWithWebAuthnParams,
  Mandate,
  PasskeySignature,
} from './types.js';

export const MANDATE_DOMAIN_TAG = 'MandateManager.createMandate.v2';

/**
 * Computes the canonical mandate hash that must be authorized by the passkey.
 * Commits strictly to chainId, contract address, owner, agentAddress, agentId, allowlisted targets,
 * spending limits, expiry, and replay nonce.
 */
export function computeMandateHash(params: {
  chainId: number;
  mandateManagerAddress: Address;
  owner: Address;
  agentAddress: Address;
  agentId: bigint;
  targets: AllowedTarget[];
  maxValuePerTx: bigint;
  maxTotalValue: bigint;
  expiresAt: bigint;
  nonce: bigint;
}): Hex {
  // 1. Hash the array of AllowedTarget tuples
  const targetsEncoded = encodeAbiParameters(
    parseAbiParameters('(address target, bytes4 selector)[]'),
    [params.targets.map((t) => ({ target: t.target, selector: t.selector }))]
  );
  const targetsHash = keccak256(targetsEncoded);

  // 2. Hash the domain separator tag
  const domainHash = keccak256(stringToHex(MANDATE_DOMAIN_TAG));

  // 3. Hash the canonical mandate parameters (matches Solidity _mandateHash v2)
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        'bytes32 domain, uint256 chainId, address contractAddr, address owner, address agentAddress, uint256 agentId, bytes32 targetsHash, uint256 maxValuePerTx, uint256 maxTotalValue, uint256 expiresAt, uint256 nonce'
      ),
      [
        domainHash,
        BigInt(params.chainId),
        params.mandateManagerAddress,
        params.owner,
        params.agentAddress,
        params.agentId,
        targetsHash,
        params.maxValuePerTx,
        params.maxTotalValue,
        params.expiresAt,
        params.nonce,
      ]
    )
  );
}

/**
 * Reads a mandate's state from the MandateManager contract.
 */
export async function getMandate(
  publicClient: PublicClient,
  contractAddress: Address,
  mandateId: bigint
): Promise<Mandate> {
  const data = await publicClient.readContract({
    address: contractAddress,
    abi: MandateManagerABI,
    functionName: 'getMandate',
    args: [mandateId],
  });

  return {
    owner: data.owner,
    agentAddress: data.agentAddress,
    agentId: data.agentId,
    maxValuePerTx: data.maxValuePerTx,
    maxTotalValue: data.maxTotalValue,
    spentValue: data.spentValue,
    expiresAt: data.expiresAt,
    nonce: data.nonce,
    revoked: data.revoked,
  };
}

/**
 * Reads the isolated vault balance of a given mandate.
 */
export async function getMandateBalance(
  publicClient: PublicClient,
  contractAddress: Address,
  mandateId: bigint
): Promise<bigint> {
  return (await publicClient.readContract({
    address: contractAddress,
    abi: MandateManagerABI,
    functionName: 'mandateBalances',
    args: [mandateId],
  })) as bigint;
}

/**
 * Reads the list of allowed targets for a given mandate.
 */
export async function getAllowedTargets(
  publicClient: PublicClient,
  contractAddress: Address,
  mandateId: bigint
): Promise<AllowedTarget[]> {
  const data = await publicClient.readContract({
    address: contractAddress,
    abi: MandateManagerABI,
    functionName: 'getAllowedTargets',
    args: [mandateId],
  });

  return data.map((t) => ({
    target: t.target,
    selector: t.selector as Hex,
  }));
}

/**
 * Checks if a mandate is active (exists, unrevoked, and unexpired).
 */
export async function isMandateActive(
  publicClient: PublicClient,
  contractAddress: Address,
  mandateId: bigint
): Promise<boolean> {
  return (await publicClient.readContract({
    address: contractAddress,
    abi: MandateManagerABI,
    functionName: 'isActive',
    args: [mandateId],
  })) as boolean;
}

/**
 * Fetches the current creation nonce for an owner.
 */
export async function getOwnerNonce(
  publicClient: PublicClient,
  contractAddress: Address,
  owner: Address
): Promise<bigint> {
  return await publicClient.readContract({
    address: contractAddress,
    abi: MandateManagerABI,
    functionName: 'ownerNonces',
    args: [owner],
  });
}

/**
 * Submits a new passkey-authorized mandate with a raw P-256 signature.
 */
export async function createMandate(
  walletClient: WalletClient,
  publicClient: PublicClient,
  contractAddress: Address,
  params: CreateMandateParams,
  passkeySig: PasskeySignature
): Promise<{ mandateId: bigint; transactionHash: Hex }> {
  const [account] = await walletClient.getAddresses();
  if (!account) throw new Error('No account available in WalletClient');

  const nonce = params.nonce ?? (await getOwnerNonce(publicClient, contractAddress, account));

  const hash = await walletClient.writeContract({
    account,
    chain: walletClient.chain,
    address: contractAddress,
    abi: MandateManagerABI,
    functionName: 'createMandate',
    args: [
      params.agentAddress,
      params.agentId,
      params.targets.map((t) => ({ target: t.target, selector: t.selector })),
      params.maxValuePerTx,
      params.maxTotalValue,
      params.expiresAt,
      nonce,
      passkeySig.sigR,
      passkeySig.sigS,
      passkeySig.challengeHash,
    ],
    value: params.depositValue ?? 0n,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  let createdMandateId: bigint | undefined;
  for (const log of receipt.logs) {
    try {
      if (log.topics[0] && log.topics[1]) {
        createdMandateId = BigInt(log.topics[1]);
        break;
      }
    } catch {
      // continue
    }
  }

  if (createdMandateId === undefined) {
    const nextId = await publicClient.readContract({
      address: contractAddress,
      abi: MandateManagerABI,
      functionName: 'nextMandateId',
    });
    createdMandateId = nextId - 1n;
  }

  return { mandateId: createdMandateId, transactionHash: hash };
}

/**
 * Submits a new passkey-authorized mandate using a genuine WebAuthn assertion envelope.
 */
export async function createMandateWithWebAuthn(
  walletClient: WalletClient,
  publicClient: PublicClient,
  contractAddress: Address,
  params: CreateMandateWithWebAuthnParams
): Promise<{ mandateId: bigint; transactionHash: Hex }> {
  const [account] = await walletClient.getAddresses();
  if (!account) throw new Error('No account available in WalletClient');

  const nonce = params.nonce ?? (await getOwnerNonce(publicClient, contractAddress, account));

  const hash = await walletClient.writeContract({
    account,
    chain: walletClient.chain,
    address: contractAddress,
    abi: MandateManagerABI,
    functionName: 'createMandateWithWebAuthn',
    args: [
      params.agentAddress,
      params.agentId,
      params.targets.map((t) => ({ target: t.target, selector: t.selector })),
      params.maxValuePerTx,
      params.maxTotalValue,
      params.expiresAt,
      nonce,
      params.sigR,
      params.sigS,
      params.authenticatorData,
      params.clientDataJSON,
      params.challengeOffset,
    ],
    value: params.depositValue ?? 0n,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  let createdMandateId: bigint | undefined;
  for (const log of receipt.logs) {
    try {
      if (log.topics[0] && log.topics[1]) {
        createdMandateId = BigInt(log.topics[1]);
        break;
      }
    } catch {
      // continue
    }
  }

  if (createdMandateId === undefined) {
    const nextId = await publicClient.readContract({
      address: contractAddress,
      abi: MandateManagerABI,
      functionName: 'nextMandateId',
    });
    createdMandateId = nextId - 1n;
  }

  return { mandateId: createdMandateId, transactionHash: hash };
}

/**
 * Deposit native tokens into a mandate's isolated vault balance.
 */
export async function depositFunds(
  walletClient: WalletClient,
  publicClient: PublicClient,
  contractAddress: Address,
  mandateId: bigint,
  amount: bigint
): Promise<{ transactionHash: Hex }> {
  const [account] = await walletClient.getAddresses();
  if (!account) throw new Error('No account available in WalletClient');

  const hash = await walletClient.writeContract({
    account,
    chain: walletClient.chain,
    address: contractAddress,
    abi: MandateManagerABI,
    functionName: 'deposit',
    args: [mandateId],
    value: amount,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return { transactionHash: hash };
}

/**
 * Withdraw unspent funds from a revoked or expired mandate back to owner.
 */
export async function withdrawUnspent(
  walletClient: WalletClient,
  publicClient: PublicClient,
  contractAddress: Address,
  mandateId: bigint
): Promise<{ transactionHash: Hex }> {
  const [account] = await walletClient.getAddresses();
  if (!account) throw new Error('No account available in WalletClient');

  const hash = await walletClient.writeContract({
    account,
    chain: walletClient.chain,
    address: contractAddress,
    abi: MandateManagerABI,
    functionName: 'withdrawUnspent',
    args: [mandateId],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return { transactionHash: hash };
}

/**
 * Revokes a mandate on-chain.
 */
export async function revokeMandate(
  walletClient: WalletClient,
  publicClient: PublicClient,
  contractAddress: Address,
  mandateId: bigint
): Promise<{ transactionHash: Hex }> {
  const [account] = await walletClient.getAddresses();
  if (!account) throw new Error('No account available in WalletClient');

  const hash = await walletClient.writeContract({
    account,
    chain: walletClient.chain,
    address: contractAddress,
    abi: MandateManagerABI,
    functionName: 'revokeMandate',
    args: [mandateId],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return { transactionHash: hash };
}
