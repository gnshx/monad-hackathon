import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  toFunctionSelector,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { AgentMandatesABI } from './abi.js';
import type { PasskeyPublicKey, WebAuthnAssertion } from './webauthn.js';

export const ANY_SELECTOR: Hex = '0x00000000';

export interface Permission {
  target: Address;
  /** 4-byte selector, or ANY_SELECTOR for any call (including plain transfers) to target. */
  selector: Hex;
}

export interface MandateTerms {
  agent: Address;
  agentId: bigint;
  permissions: Permission[];
  maxPerCall: bigint;
  budget: bigint;
  /** Unix seconds; 0n = never. */
  expiresAt: bigint;
}

export interface OnchainMandate {
  ownerKey: Hex;
  agent: Address;
  agentId: bigint;
  maxPerCall: bigint;
  budget: bigint;
  spent: bigint;
  balance: bigint;
  expiresAt: bigint;
  epoch: bigint;
  revoked: boolean;
}

/** Revert reasons execute() can raise, keyed by their 4-byte selector. */
export const MANDATE_ERRORS: Record<string, string> = Object.fromEntries(
  AgentMandatesABI.filter((x) => x.type === 'error').map((e) => [toFunctionSelector(`${e.name}()`), e.name])
);

const TYPEHASH = {
  create: keccak256(toHex('AgentMandates.Create.v1')),
  revoke: keccak256(toHex('AgentMandates.Revoke.v1')),
  revokeAll: keccak256(toHex('AgentMandates.RevokeAll.v1')),
  withdraw: keccak256(toHex('AgentMandates.Withdraw.v1')),
};

/** keccak256(abi.encode(x, y)): the passkey's identity on-chain. */
export function ownerKeyOf(pk: PasskeyPublicKey): Hex {
  return keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }], [pk.x, pk.y]));
}

interface Domain {
  chainId: number;
  contract: Address;
}

/** What the passkey signs to create a mandate. Mirrors AgentMandates.createDigest. */
export function createDigest(d: Domain, ownerKey: Hex, t: MandateTerms, nonce: bigint): Hex {
  const permissionsHash = keccak256(
    encodeAbiParameters(
      [{ type: 'tuple[]', components: [{ name: 'target', type: 'address' }, { name: 'selector', type: 'bytes4' }] }],
      [t.permissions.map((p) => ({ target: p.target, selector: p.selector }))]
    )
  );
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }, { type: 'address' },
        { type: 'uint256' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint64' },
        { type: 'uint256' },
      ],
      [
        TYPEHASH.create, BigInt(d.chainId), d.contract, ownerKey, t.agent,
        t.agentId, permissionsHash, t.maxPerCall, t.budget, t.expiresAt,
        nonce,
      ]
    )
  );
}

export function revokeDigest(d: Domain, ownerKey: Hex, mandateId: bigint, nonce: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'uint256' }],
      [TYPEHASH.revoke, BigInt(d.chainId), d.contract, ownerKey, mandateId, nonce]
    )
  );
}

export function revokeAllDigest(d: Domain, ownerKey: Hex, nonce: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }, { type: 'uint256' }],
      [TYPEHASH.revokeAll, BigInt(d.chainId), d.contract, ownerKey, nonce]
    )
  );
}

export function withdrawDigest(d: Domain, ownerKey: Hex, mandateId: bigint, to: Address, amount: bigint, nonce: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' },
        { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' },
      ],
      [TYPEHASH.withdraw, BigInt(d.chainId), d.contract, ownerKey, mandateId, to, amount, nonce]
    )
  );
}

/** Calldata for owner actions, so any relayer can submit them. */
export const encode = {
  createMandate: (pk: PasskeyPublicKey, terms: MandateTerms, auth: WebAuthnAssertion) =>
    encodeFunctionData({ abi: AgentMandatesABI, functionName: 'createMandate', args: [pk, terms, auth] }),
  revoke: (mandateId: bigint, auth: WebAuthnAssertion) =>
    encodeFunctionData({ abi: AgentMandatesABI, functionName: 'revoke', args: [mandateId, auth] }),
  revokeAll: (ownerKey: Hex, auth: WebAuthnAssertion) =>
    encodeFunctionData({ abi: AgentMandatesABI, functionName: 'revokeAll', args: [ownerKey, auth] }),
  withdraw: (mandateId: bigint, to: Address, amount: bigint, auth: WebAuthnAssertion) =>
    encodeFunctionData({ abi: AgentMandatesABI, functionName: 'withdraw', args: [mandateId, to, amount, auth] }),
};

export interface CheckResult {
  allowed: boolean;
  /** Error name execute() would revert with, e.g. "ExceedsBudget". Undefined when allowed. */
  reason?: string;
}

/**
 * Read and act on AgentMandates. Reads need only a PublicClient; execute() needs the agent's
 * WalletClient. Owner actions are passkey-signed: build the digest, sign it, then submit with
 * `encode.*` through any relayer, or through `submit*` here with any funded wallet.
 */
export class AgentMandates {
  constructor(
    readonly address: Address,
    readonly publicClient: PublicClient,
    readonly walletClient?: WalletClient
  ) {}

  async domain(): Promise<Domain> {
    return { chainId: await this.publicClient.getChainId(), contract: this.address };
  }

  async getMandate(mandateId: bigint): Promise<OnchainMandate> {
    return (await this.publicClient.readContract({
      address: this.address, abi: AgentMandatesABI, functionName: 'getMandate', args: [mandateId],
    })) as OnchainMandate;
  }

  async getPermissions(mandateId: bigint): Promise<readonly Permission[]> {
    return this.publicClient.readContract({
      address: this.address, abi: AgentMandatesABI, functionName: 'getPermissions', args: [mandateId],
    });
  }

  async isActive(mandateId: bigint): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.address, abi: AgentMandatesABI, functionName: 'isActive', args: [mandateId],
    });
  }

  async nonce(ownerKey: Hex): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.address, abi: AgentMandatesABI, functionName: 'nonces', args: [ownerKey],
    });
  }

  /** Ask the contract whether `agent` may make this call right now. Same checks as execute(). */
  async checkAction(mandateId: bigint, agent: Address, target: Address, data: Hex, value: bigint): Promise<CheckResult> {
    const [allowed, reason] = await this.publicClient.readContract({
      address: this.address, abi: AgentMandatesABI, functionName: 'checkAction',
      args: [mandateId, agent, target, data, value],
    });
    return allowed ? { allowed } : { allowed, reason: MANDATE_ERRORS[reason] ?? reason };
  }

  /** Digest the passkey must sign to create `terms`, using the owner's current nonce. */
  async createChallenge(owner: PasskeyPublicKey, terms: MandateTerms): Promise<Hex> {
    const key = ownerKeyOf(owner);
    return createDigest(await this.domain(), key, terms, await this.nonce(key));
  }

  async revokeChallenge(owner: PasskeyPublicKey, mandateId: bigint): Promise<Hex> {
    const key = ownerKeyOf(owner);
    return revokeDigest(await this.domain(), key, mandateId, await this.nonce(key));
  }

  async revokeAllChallenge(owner: PasskeyPublicKey): Promise<Hex> {
    const key = ownerKeyOf(owner);
    return revokeAllDigest(await this.domain(), key, await this.nonce(key));
  }

  async withdrawChallenge(owner: PasskeyPublicKey, mandateId: bigint, to: Address, amount: bigint): Promise<Hex> {
    const key = ownerKeyOf(owner);
    return withdrawDigest(await this.domain(), key, mandateId, to, amount, await this.nonce(key));
  }

  /** Submit a signed owner action from this client's wallet (acting as relayer). */
  async relay(data: Hex, value = 0n): Promise<Hex> {
    const wallet = this.requireWallet();
    const hash = await wallet.sendTransaction({
      account: wallet.account!, chain: wallet.chain, to: this.address, data, value,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`Relayed transaction reverted: ${hash}`);
    return hash;
  }

  /**
   * Run a call as the agent. Pre-checks with checkAction() so a disallowed call fails here with
   * a readable reason instead of burning gas on a revert.
   */
  async execute(mandateId: bigint, target: Address, data: Hex, value = 0n): Promise<{ hash: Hex }> {
    const wallet = this.requireWallet();
    const check = await this.checkAction(mandateId, wallet.account!.address, target, data, value);
    if (!check.allowed) throw new MandateDeniedError(check.reason ?? 'denied');
    const hash = await wallet.writeContract({
      account: wallet.account!, chain: wallet.chain, address: this.address, abi: AgentMandatesABI,
      functionName: 'execute', args: [mandateId, target, data, value],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`execute reverted: ${hash}`);
    return { hash };
  }

  private requireWallet(): WalletClient {
    if (!this.walletClient?.account) throw new Error('A WalletClient with an account is required');
    return this.walletClient;
  }
}

export class MandateDeniedError extends Error {
  constructor(readonly reason: string) {
    super(`AgentMandates denied the call: ${reason}`);
    this.name = 'MandateDeniedError';
  }
}
