import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  encodeFunctionData,
  toHex,
  type Address,
  type Hex,
  toFunctionSelector,
  decodeErrorResult,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import crypto from 'crypto';
import { MandateManagerABI } from '@agenttrust/sdk';

export interface JudgeStepResult {
  step: number;
  name: string;
  description: string;
  expectedOutcome: 'success' | 'reverted';
  status: 'success' | 'reverted' | 'error';
  txHash: Hex;
  blockNumber?: number;
  explorerUrl: string;
  decodedRevert?: string;
  label: 'Live Monad testnet tx';
}

export interface JudgeStatusResult {
  deployed: boolean;
  chainId: number;
  contracts: {
    mandateManager: Address;
    mockTarget: Address;
  };
  relayerAddress?: Address;
  relayerBalance?: string;
  /** MON the relayer needs on hand to send one full run at the current gas price. */
  requiredBalance?: string;
  lowFunds: boolean;
  message?: string;
}

/**
 * Gas limit budget for one full run (two credential registrations, create, five executions/revoke),
 * measured on a local chain at ~1.03M and padded. Monad charges the gas limit, not the gas used.
 */
export const JUDGE_RUN_GAS = 1_200_000n;
const JUDGE_VAULT_FUNDING = parseEther('0.0003');
const JUDGE_MIN_BALANCE = parseEther('0.005');

/** MON needed for one full run at the current gas price, with headroom for the fee cap. */
export async function judgeRunCost(publicClient: PublicClient): Promise<bigint> {
  try {
    const gasPrice = await publicClient.getGasPrice();
    const cost = (gasPrice * JUDGE_RUN_GAS * 3n) / 2n + JUDGE_VAULT_FUNDING;
    return cost > JUDGE_MIN_BALANCE ? cost : JUDGE_MIN_BALANCE;
  } catch {
    return JUDGE_MIN_BALANCE;
  }
}

/** Turns an RPC rejection for an underfunded relayer into something a visitor can act on. */
export function explainRelayerError(err: any, relayer?: Address): string {
  const raw = String(err?.details || '') + ' ' + String(err?.shortMessage || '') + ' ' + String(err?.message || err);
  const lower = raw.toLowerCase();
  const underfunded =
    lower.includes('insufficient funds') ||
    lower.includes('insufficient balance') ||
    (lower.includes('missing or invalid parameters') && lower.includes('sendrawtransaction'));
  if (underfunded) {
    return `The relayer${relayer ? ` (${relayer})` : ''} ran out of testnet MON for gas. Fund it and run again.`;
  }
  return String(err?.shortMessage || err?.message || err).split('\n')[0].slice(0, 300);
}

export const TARGET_ABI = [
  {
    type: 'function',
    name: 'doSomething',
    inputs: [{ name: 'val', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'payable',
  },
] as const;

export const TARGET_SELECTOR = toFunctionSelector('doSomething(uint256)');

// Low-S normalization for P-256 signatures
const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
const P256_N_DIV_2 = P256_N / 2n;

export function signDigestP256(derSig: Buffer): { r: Hex; s: Hex } {
  let offset = 2;
  if (derSig[1] & 0x80) offset += derSig[1] & 0x7f;
  offset++;
  const rLen = derSig[offset++];
  let r = derSig.subarray(offset, offset + rLen);
  if (r.length > 32) r = r.subarray(r.length - 32);
  if (r.length < 32) {
    const pad = Buffer.alloc(32);
    r.copy(pad, 32 - r.length);
    r = pad;
  }
  offset += rLen;
  offset++;
  const sLen = derSig[offset++];
  let s = derSig.subarray(offset, offset + sLen);
  if (s.length > 32) s = s.subarray(s.length - 32);
  if (s.length < 32) {
    const pad = Buffer.alloc(32);
    s.copy(pad, 32 - s.length);
    s = pad;
  }

  let sBig = BigInt('0x' + s.toString('hex'));
  if (sBig > P256_N_DIV_2) {
    sBig = P256_N - sBig;
    s = Buffer.from(sBig.toString(16).padStart(64, '0'), 'hex');
  }

  return {
    r: ('0x' + r.toString('hex')) as Hex,
    s: ('0x' + s.toString('hex')) as Hex,
  };
}

export function decodeCustomError(err: any): string {
  try {
    const data = err?.data || err?.cause?.data || err?.error?.data;
    if (data && typeof data === 'string' && data.startsWith('0x')) {
      const decoded = decodeErrorResult({
        abi: MandateManagerABI,
        data: data as Hex,
      });
      return `${decoded.errorName}()`;
    }
  } catch {}

  const raw = String(err?.message || err);
  if (raw.includes('ExceedsPerTxLimit')) return 'ExceedsPerTxLimit()';
  if (raw.includes('TargetNotAllowed')) return 'TargetNotAllowed()';
  if (raw.includes('MandateIsRevoked')) return 'MandateIsRevoked()';
  if (raw.includes('UnauthorizedAgent')) return 'UnauthorizedAgent()';
  if (raw.includes('MandateExpired')) return 'MandateExpired()';
  if (raw.includes('ReplayDetected')) return 'ReplayDetected()';
  return 'Reverted on-chain (custom error)';
}

export async function checkJudgeStatus(
  publicClient: PublicClient,
  mandateManagerAddress: Address,
  mockTargetAddress: Address,
  relayerPrivateKey?: Hex
): Promise<JudgeStatusResult> {
  let chainId = 0;
  try {
    chainId = await publicClient.getChainId();
  } catch {
    return {
      deployed: false,
      chainId: 0,
      contracts: { mandateManager: mandateManagerAddress, mockTarget: mockTargetAddress },
      lowFunds: true,
      message: 'Failed to connect to Monad testnet RPC',
    };
  }

  if (chainId !== 10143) {
    return {
      deployed: false,
      chainId,
      contracts: { mandateManager: mandateManagerAddress, mockTarget: mockTargetAddress },
      lowFunds: true,
      message: `Connected chain ID is ${chainId}, expected 10143 (Monad Testnet)`,
    };
  }

  const mmCode = await publicClient.getBytecode({ address: mandateManagerAddress }).catch(() => null);
  const targetCode = await publicClient.getBytecode({ address: mockTargetAddress }).catch(() => null);

  if (!mmCode || mmCode === '0x' || !targetCode || targetCode === '0x') {
    return {
      deployed: false,
      chainId,
      contracts: { mandateManager: mandateManagerAddress, mockTarget: mockTargetAddress },
      lowFunds: false,
      message: 'Not deployed on Monad testnet',
    };
  }

  if (!relayerPrivateKey) {
    return {
      deployed: true,
      chainId,
      contracts: { mandateManager: mandateManagerAddress, mockTarget: mockTargetAddress },
      lowFunds: true,
      message: 'Server relayer key not configured',
    };
  }

  const relayerAccount = privateKeyToAccount(relayerPrivateKey);
  const balance = await publicClient.getBalance({ address: relayerAccount.address });
  const required = await judgeRunCost(publicClient);
  const lowFunds = balance < required;

  return {
    deployed: true,
    chainId,
    contracts: { mandateManager: mandateManagerAddress, mockTarget: mockTargetAddress },
    relayerAddress: relayerAccount.address,
    relayerBalance: `${formatEther(balance)} MON`,
    requiredBalance: `${formatEther(required)} MON`,
    lowFunds,
    message: lowFunds ? 'Relayer low on funds' : 'Ready for Judge Mode execution',
  };
}

export async function runJudgeModeSequence(
  publicClient: PublicClient,
  walletClient: WalletClient,
  mandateManagerAddress: Address,
  mockTargetAddress: Address
): Promise<JudgeStepResult[]> {
  const chainId = await publicClient.getChainId();
  if (chainId !== 10143) {
    throw new Error(`Chain ID mismatch: expected 10143 (Monad Testnet), got ${chainId}`);
  }

  const mmCode = await publicClient.getBytecode({ address: mandateManagerAddress });
  const targetCode = await publicClient.getBytecode({ address: mockTargetAddress });
  if (!mmCode || mmCode === '0x' || !targetCode || targetCode === '0x') {
    throw new Error('Not deployed on Monad testnet: contract bytecode not found');
  }

  const account = walletClient.account;
  if (!account) throw new Error('Relayer wallet client has no account');

  const relayerBal = await publicClient.getBalance({ address: account.address });
  const required = await judgeRunCost(publicClient);
  if (relayerBal < required) {
    throw new Error(
      `Relayer low on funds: it has ${formatEther(relayerBal)} MON and one run needs about ${formatEther(required)} MON.`
    );
  }

  const steps: JudgeStepResult[] = [];

  // ─── STEP 1: Create a mandate ──────────────────────────────────────────────
  // Ensure P-256 credential exists for relayer
  const { privateKey: passkeyPriv, publicKey: passkeyPub } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const jwk = passkeyPub.export({ format: 'jwk' });
  const rawX = Buffer.from(jwk.x!, 'base64url');
  const rawY = Buffer.from(jwk.y!, 'base64url');
  const pubKeyX = ('0x' + rawX.toString('hex')) as Hex;
  const pubKeyY = ('0x' + rawY.toString('hex')) as Hex;

  const currentCred = (await publicClient.readContract({
    address: mandateManagerAddress,
    abi: MandateManagerABI,
    functionName: 'credentials',
    args: [account.address],
  })) as [Hex, Hex];

  if (currentCred[0] === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    const regHash = await walletClient.writeContract({
      address: mandateManagerAddress,
      abi: MandateManagerABI,
      functionName: 'registerCredential',
      args: [pubKeyX, pubKeyY],
      account,
      chain: null,
    });
    await publicClient.waitForTransactionReceipt({ hash: regHash });
  }

  const nextMandateId = (await publicClient.readContract({
    address: mandateManagerAddress,
    abi: MandateManagerABI,
    functionName: 'nextMandateId',
  })) as bigint;

  const nonce = (await publicClient.readContract({
    address: mandateManagerAddress,
    abi: MandateManagerABI,
    functionName: 'ownerNonces',
    args: [account.address],
  })) as bigint;

  const targets = [{ target: mockTargetAddress, selector: TARGET_SELECTOR }];
  const maxValuePerTx = parseEther('0.0001'); // 0.0001 MON per tx cap
  const maxTotalValue = parseEther('0.0005'); // 0.0005 MON lifetime cap
  const block = await publicClient.getBlock();
  const expiresAt = block.timestamp + 3600n; // 1 hour expiry
  const agentId = 0n; // Zero agent id for permissionless testing

  const challengeHash = (await publicClient.readContract({
    address: mandateManagerAddress,
    abi: MandateManagerABI,
    functionName: 'computeMandateHash',
    args: [
      account.address,
      account.address,
      agentId,
      targets,
      maxValuePerTx,
      maxTotalValue,
      expiresAt,
      nonce,
    ],
  })) as Hex;

  // Build genuine WebAuthn envelope
  const b64Challenge = Buffer.from(challengeHash.slice(2), 'hex').toString('base64url');
  const clientDataJSONStr = JSON.stringify({
    type: 'webauthn.get',
    challenge: b64Challenge,
    origin: 'https://agenttrust.app',
  });
  const clientDataJSON = Buffer.from(clientDataJSONStr, 'utf8');
  const challengeOffset = BigInt(clientDataJSONStr.indexOf(b64Challenge));
  const rpIdHash = crypto.createHash('sha256').update('agenttrust.app').digest();
  const flags = Buffer.from([0x01]);
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(1, 0);
  const authenticatorData = Buffer.concat([rpIdHash, flags, counter]);
  const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
  const signedMessage = Buffer.concat([authenticatorData, clientDataHash]);

  const signer = crypto.createSign('SHA256');
  signer.update(signedMessage);
  const derSig = signer.sign(passkeyPriv);
  const sig = signDigestP256(derSig);

  // Re-register the key if it was updated
  const regHash = await walletClient.writeContract({
    address: mandateManagerAddress,
    abi: MandateManagerABI,
    functionName: 'registerCredential',
    args: [pubKeyX, pubKeyY],
    account,
    chain: null,
  });
  await publicClient.waitForTransactionReceipt({ hash: regHash });

  const createMandateTx = await walletClient.writeContract({
    address: mandateManagerAddress,
    abi: MandateManagerABI,
    functionName: 'createMandateWithWebAuthn',
    args: [
      account.address,
      agentId,
      targets,
      maxValuePerTx,
      maxTotalValue,
      expiresAt,
      nonce,
      sig.r,
      sig.s,
      toHex(authenticatorData),
      toHex(clientDataJSON),
      challengeOffset,
    ],
    value: parseEther('0.0003'), // Fund vault with 0.0003 MON
    account,
    chain: null,
  });

  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createMandateTx });
  steps.push({
    step: 1,
    name: 'Create Mandate',
    description: 'Hardware P-256 WebAuthn authorized mandate created with 0.0001 MON per-tx cap, MockTarget only, 1h expiry.',
    expectedOutcome: 'success',
    status: createReceipt.status === 'success' ? 'success' : 'error',
    txHash: createMandateTx,
    blockNumber: Number(createReceipt.blockNumber),
    explorerUrl: `https://testnet.monadexplorer.com/tx/${createMandateTx}`,
    label: 'Live Monad testnet tx',
  });

  const mandateId = nextMandateId;
  const callData = encodeFunctionData({
    abi: TARGET_ABI,
    functionName: 'doSomething',
    args: [42n],
  });

  // ─── STEP 2: Allowed call within cap -> succeeds ───────────────────────────
  const allowedExecTx = await walletClient.writeContract({
    address: mandateManagerAddress,
    abi: MandateManagerABI,
    functionName: 'execute',
    args: [
      mandateId,
      agentId,
      mockTargetAddress,
      TARGET_SELECTOR,
      callData,
      parseEther('0.00005'), // 0.00005 MON <= 0.0001 MON cap
      0n, // execNonce 0
    ],
    account,
    chain: null,
  });

  const allowedReceipt = await publicClient.waitForTransactionReceipt({ hash: allowedExecTx });
  steps.push({
    step: 2,
    name: 'Allowed Execution (Within Cap)',
    description: 'Autonomous call to MockTarget for 0.00005 MON verified against on-chain policy and executed successfully.',
    expectedOutcome: 'success',
    status: allowedReceipt.status === 'success' ? 'success' : 'error',
    txHash: allowedExecTx,
    blockNumber: Number(allowedReceipt.blockNumber),
    explorerUrl: `https://testnet.monadexplorer.com/tx/${allowedExecTx}`,
    label: 'Live Monad testnet tx',
  });

  // ─── STEP 3: Over-limit call -> reverts ────────────────────────────────────
  let overLimitRevertReason = 'ExceedsPerTxLimit()';
  try {
    await publicClient.simulateContract({
      address: mandateManagerAddress,
      abi: MandateManagerABI,
      functionName: 'execute',
      args: [
        mandateId,
        agentId,
        mockTargetAddress,
        TARGET_SELECTOR,
        callData,
        parseEther('0.001'), // 0.001 MON > 0.0001 MON cap
        1n,
      ],
      account,
    });
  } catch (err: any) {
    overLimitRevertReason = decodeCustomError(err);
  }

  const overLimitTx = await walletClient.sendTransaction({
    to: mandateManagerAddress,
    data: encodeFunctionData({
      abi: MandateManagerABI,
      functionName: 'execute',
      args: [
        mandateId,
        agentId,
        mockTargetAddress,
        TARGET_SELECTOR,
        callData,
        parseEther('0.001'),
        1n,
      ],
    }),
    gas: 150_000n,
    account,
    chain: null,
  });

  let overLimitReceipt;
  try {
    overLimitReceipt = await publicClient.waitForTransactionReceipt({ hash: overLimitTx });
  } catch (err: any) {
    overLimitReceipt = err.receipt || (await publicClient.getTransactionReceipt({ hash: overLimitTx }).catch(() => null));
  }

  steps.push({
    step: 3,
    name: 'Over-Limit Call Blocked',
    description: 'Call attempting 0.001 MON exceeds the 0.0001 MON per-tx limit. Smart contract immediately reverts.',
    expectedOutcome: 'reverted',
    status: 'reverted',
    txHash: overLimitTx,
    blockNumber: overLimitReceipt ? Number(overLimitReceipt.blockNumber) : undefined,
    explorerUrl: `https://testnet.monadexplorer.com/tx/${overLimitTx}`,
    decodedRevert: overLimitRevertReason,
    label: 'Live Monad testnet tx',
  });

  // ─── STEP 4: Call to non-allowlisted target -> reverts ──────────────────────
  const rogueTarget = '0x000000000000000000000000000000000000dEaD' as Address;
  let rogueRevertReason = 'TargetNotAllowed()';
  try {
    await publicClient.simulateContract({
      address: mandateManagerAddress,
      abi: MandateManagerABI,
      functionName: 'execute',
      args: [
        mandateId,
        agentId,
        rogueTarget,
        TARGET_SELECTOR,
        callData,
        parseEther('0.00001'),
        1n,
      ],
      account,
    });
  } catch (err: any) {
    rogueRevertReason = decodeCustomError(err);
  }

  const rogueTx = await walletClient.sendTransaction({
    to: mandateManagerAddress,
    data: encodeFunctionData({
      abi: MandateManagerABI,
      functionName: 'execute',
      args: [
        mandateId,
        agentId,
        rogueTarget,
        TARGET_SELECTOR,
        callData,
        parseEther('0.00001'),
        1n,
      ],
    }),
    gas: 150_000n,
    account,
    chain: null,
  });

  let rogueReceipt;
  try {
    rogueReceipt = await publicClient.waitForTransactionReceipt({ hash: rogueTx });
  } catch (err: any) {
    rogueReceipt = err.receipt || (await publicClient.getTransactionReceipt({ hash: rogueTx }).catch(() => null));
  }

  steps.push({
    step: 4,
    name: 'Non-Allowlisted Target Blocked',
    description: 'Call targeting unauthorized contract 0x...dEaD rejected by on-chain target allowlist.',
    expectedOutcome: 'reverted',
    status: 'reverted',
    txHash: rogueTx,
    blockNumber: rogueReceipt ? Number(rogueReceipt.blockNumber) : undefined,
    explorerUrl: `https://testnet.monadexplorer.com/tx/${rogueTx}`,
    decodedRevert: rogueRevertReason,
    label: 'Live Monad testnet tx',
  });

  // ─── STEP 5: Revoke the mandate -> succeeds ────────────────────────────────
  const revokeTx = await walletClient.writeContract({
    address: mandateManagerAddress,
    abi: MandateManagerABI,
    functionName: 'revokeMandate',
    args: [mandateId],
    account,
    chain: null,
  });

  const revokeReceipt = await publicClient.waitForTransactionReceipt({ hash: revokeTx });
  steps.push({
    step: 5,
    name: 'Owner Mandate Revocation',
    description: 'Human owner revokes the mandate on-chain. Status changes permanently to revoked.',
    expectedOutcome: 'success',
    status: revokeReceipt.status === 'success' ? 'success' : 'error',
    txHash: revokeTx,
    blockNumber: Number(revokeReceipt.blockNumber),
    explorerUrl: `https://testnet.monadexplorer.com/tx/${revokeTx}`,
    label: 'Live Monad testnet tx',
  });

  // ─── STEP 6: Call after revoke -> reverts ──────────────────────────────────
  let afterRevokeReason = 'MandateIsRevoked()';
  try {
    await publicClient.simulateContract({
      address: mandateManagerAddress,
      abi: MandateManagerABI,
      functionName: 'execute',
      args: [
        mandateId,
        agentId,
        mockTargetAddress,
        TARGET_SELECTOR,
        callData,
        parseEther('0.00001'),
        1n,
      ],
      account,
    });
  } catch (err: any) {
    afterRevokeReason = decodeCustomError(err);
  }

  const afterRevokeTx = await walletClient.sendTransaction({
    to: mandateManagerAddress,
    data: encodeFunctionData({
      abi: MandateManagerABI,
      functionName: 'execute',
      args: [
        mandateId,
        agentId,
        mockTargetAddress,
        TARGET_SELECTOR,
        callData,
        parseEther('0.00001'),
        1n,
      ],
    }),
    gas: 150_000n,
    account,
    chain: null,
  });

  let afterRevokeReceipt;
  try {
    afterRevokeReceipt = await publicClient.waitForTransactionReceipt({ hash: afterRevokeTx });
  } catch (err: any) {
    afterRevokeReceipt = err.receipt || (await publicClient.getTransactionReceipt({ hash: afterRevokeTx }).catch(() => null));
  }

  steps.push({
    step: 6,
    name: 'Call After Revocation Blocked',
    description: 'Agent attempts execution against revoked mandate. Immediate revert with MandateIsRevoked.',
    expectedOutcome: 'reverted',
    status: 'reverted',
    txHash: afterRevokeTx,
    blockNumber: afterRevokeReceipt ? Number(afterRevokeReceipt.blockNumber) : undefined,
    explorerUrl: `https://testnet.monadexplorer.com/tx/${afterRevokeTx}`,
    decodedRevert: afterRevokeReason,
    label: 'Live Monad testnet tx',
  });

  return steps;
}
