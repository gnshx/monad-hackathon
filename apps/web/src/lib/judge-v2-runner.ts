/**
 * Judge Mode on the v2 AgentMandates contract: the same primitive the passkey console uses.
 *
 * One run, all real transactions sent by the server's relayer key:
 *   1. a fresh P-256 passkey signs a WebAuthn assertion for a mandate; the relayer submits it and
 *      Monad's P-256 precompile verifies it on-chain
 *   2. the agent (an ERC-8004 identity owned by the relayer) makes an allowed call
 *   3. it overspends the per-call cap            -> reverts ExceedsPerCallLimit
 *   4. it calls a contract it was never granted  -> reverts PermissionDenied
 *   5. the passkey signs a revoke; the relayer submits it
 *   6. the agent tries again                     -> reverts MandateInactive
 *
 * The passkey is a software authenticator held by the server for the length of one run, so the
 * page can run unattended. Its assertions are byte-for-byte WebAuthn; the contract verifies them
 * exactly as it verifies a phone's or laptop's passkey in the console.
 */
import {
  encodeFunctionData,
  formatEther,
  parseEther,
  toFunctionSelector,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import {
  AgentMandates,
  AgentMandatesABI,
  ERC8004_IDENTITY_REGISTRY_ABI,
  createSoftwarePasskey,
  encode,
  type MandateTerms,
} from '@agenttrust/sdk';
import type { JudgeStepResult } from './judge-mode-runner';

export const JUDGE_V2_TARGET_ABI = [
  {
    type: 'function',
    name: 'doSomething',
    inputs: [{ name: 'v', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'payable',
  },
] as const;

export const JUDGE_V2_SELECTOR = toFunctionSelector('doSomething(uint256)');
export const ROGUE_TARGET = '0x000000000000000000000000000000000000dEaD' as Address;

export const MAX_PER_CALL = parseEther('0.0001');
export const BUDGET = parseEther('0.0005');
/** Exactly what the allowed call spends, so nothing is left stranded in the revoked vault. */
export const VAULT_FUNDING = parseEther('0.00005');
export const ALLOWED_VALUE = parseEther('0.00005');
export const OVERSPEND_VALUE = parseEther('0.001');

/** Gas limit for calls that are expected to revert in the policy check (measured ~45k used). */
const BLOCKED_CALL_GAS = 80_000n;
/** Upper bounds when an estimate fails. Monad bills the limit, so estimates are preferred. */
const MAX_OWNER_GAS = 900_000n;
const MAX_EXECUTE_GAS = 300_000n;
/** Padded gas limit budget for a full run, including a one-off ERC-8004 registration. */
export const JUDGE_V2_RUN_GAS = 1_300_000n;

const EXPLORER = 'https://testnet.monadexplorer.com';
const ORIGIN = 'https://monad-hackathon-amber.vercel.app';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** Warm serverless instances reuse the relayer's ERC-8004 identity instead of minting another. */
let cachedAgentId: bigint | undefined;

export interface JudgeV2Setup {
  agentId: bigint;
  registrationTx?: Hex;
}

/** MON needed for one v2 run at the current gas price (fee-cap headroom plus the vault funding). */
export async function judgeV2RunCost(publicClient: PublicClient): Promise<bigint> {
  const floor = parseEther('0.005');
  try {
    const gasPrice = await publicClient.getGasPrice();
    const cost = (gasPrice * JUDGE_V2_RUN_GAS * 6n) / 5n + VAULT_FUNDING;
    return cost > floor ? cost : floor;
  } catch {
    return floor;
  }
}

async function identityRegistry(publicClient: PublicClient, mandates: Address): Promise<Address> {
  return (await publicClient.readContract({
    address: mandates,
    abi: AgentMandatesABI,
    functionName: 'identityRegistry',
  })) as Address;
}

/** Mirrors AgentMandates._agentIdentityHolds: the agent is the ERC-8004 wallet or owner of agentId. */
export async function identityHolds(
  publicClient: PublicClient,
  registry: Address,
  agent: Address,
  agentId: bigint
): Promise<boolean> {
  if (registry === zeroAddress) return true;
  const same = (a?: string) => !!a && a.toLowerCase() === agent.toLowerCase();
  try {
    const wallet = (await publicClient.readContract({
      address: registry,
      abi: ERC8004_IDENTITY_REGISTRY_ABI,
      functionName: 'getAgentWallet',
      args: [agentId],
    })) as Address;
    if (same(wallet)) return true;
  } catch {}
  try {
    const owner = (await publicClient.readContract({
      address: registry,
      abi: ERC8004_IDENTITY_REGISTRY_ABI,
      functionName: 'ownerOf',
      args: [agentId],
    })) as Address;
    return same(owner);
  } catch {
    return false;
  }
}

/**
 * The relayer acts as the agent, so it needs an ERC-8004 identity. Uses JUDGE_AGENT_ID when it
 * belongs to the relayer, otherwise mints one in the registry (one extra transaction, once per
 * warm server instance; set JUDGE_AGENT_ID to the logged ID to skip it entirely).
 */
export async function ensureAgentIdentity(
  publicClient: PublicClient,
  walletClient: WalletClient,
  mandates: Address,
  configuredId?: string
): Promise<JudgeV2Setup> {
  const relayer = walletClient.account!.address;
  const registry = await identityRegistry(publicClient, mandates);
  if (registry === zeroAddress) return { agentId: 0n };

  for (const candidate of [configuredId ? BigInt(configuredId) : undefined, cachedAgentId]) {
    if (candidate !== undefined && (await identityHolds(publicClient, registry, relayer, candidate))) {
      cachedAgentId = candidate;
      return { agentId: candidate };
    }
  }

  const data = encodeFunctionData({
    abi: ERC8004_IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: [`${ORIGIN}/agent.json`],
  });
  const gas = await estimate(publicClient, relayer, registry, data, 0n, 400_000n);
  const hash = await walletClient.sendTransaction({ account: walletClient.account!, chain: null, to: registry, data, gas });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const minted = receipt.logs.find(
    (l) => l.address.toLowerCase() === registry.toLowerCase() && l.topics[0] === TRANSFER_TOPIC && l.topics[3]
  );
  if (receipt.status !== 'success' || !minted?.topics[3]) {
    throw new Error('Could not register an ERC-8004 identity for the Judge Mode agent');
  }
  cachedAgentId = BigInt(minted.topics[3]);
  console.log(`[judge-mode] registered ERC-8004 agent #${cachedAgentId} for ${relayer}; set JUDGE_AGENT_ID=${cachedAgentId}`);
  return { agentId: cachedAgentId, registrationTx: hash };
}

async function estimate(
  publicClient: PublicClient,
  from: Address,
  to: Address,
  data: Hex,
  value: bigint,
  ceiling: bigint
): Promise<bigint> {
  try {
    const g = ((await publicClient.estimateGas({ account: from, to, data, value })) * 5n) / 4n;
    return g < ceiling ? g : ceiling;
  } catch {
    return ceiling;
  }
}

export interface JudgeV2Config {
  mandates: Address;
  target: Address;
  agentId?: string;
}

export async function runJudgeModeV2(
  publicClient: PublicClient,
  walletClient: WalletClient,
  config: JudgeV2Config
): Promise<{ steps: JudgeStepResult[]; agentId: string; mandateId: string; setupTx?: Hex }> {
  const chainId = await publicClient.getChainId();
  if (chainId !== 10143) throw new Error(`Chain ID mismatch: expected 10143 (Monad Testnet), got ${chainId}`);

  const [mandatesCode, targetCode] = await Promise.all([
    publicClient.getBytecode({ address: config.mandates }),
    publicClient.getBytecode({ address: config.target }),
  ]);
  if (!mandatesCode || mandatesCode === '0x' || !targetCode || targetCode === '0x') {
    throw new Error('Not deployed on Monad testnet: AgentMandates or its demo target has no bytecode');
  }

  const account = walletClient.account;
  if (!account) throw new Error('Relayer wallet client has no account');
  const relayer = account.address;

  const balance = await publicClient.getBalance({ address: relayer });
  const required = await judgeV2RunCost(publicClient);
  if (balance < required) {
    throw new Error(
      `Relayer low on funds: it has ${formatEther(balance)} MON and one run needs about ${formatEther(required)} MON.`
    );
  }

  const setup = await ensureAgentIdentity(publicClient, walletClient, config.mandates, config.agentId);
  const sdk = new AgentMandates(config.mandates, publicClient, walletClient);
  const passkey = createSoftwarePasskey(undefined, ORIGIN);
  const steps: JudgeStepResult[] = [];
  const call = (v: bigint) => encodeFunctionData({ abi: JUDGE_V2_TARGET_ABI, functionName: 'doSomething', args: [v] });

  const send = async (data: Hex, value: bigint, gas: bigint) => {
    const hash = await walletClient.sendTransaction({ account, chain: null, to: config.mandates, data, value, gas });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return { hash, receipt };
  };

  const push = (
    n: number,
    name: string,
    description: string,
    expectedOutcome: 'success' | 'reverted',
    r: { hash: Hex; receipt: { status: 'success' | 'reverted'; blockNumber: bigint } },
    decodedRevert?: string
  ) =>
    steps.push({
      step: n,
      name,
      description,
      expectedOutcome,
      status: r.receipt.status === 'success' ? 'success' : 'reverted',
      txHash: r.hash,
      blockNumber: Number(r.receipt.blockNumber),
      explorerUrl: `${EXPLORER}/tx/${r.hash}`,
      decodedRevert,
      label: 'Live Monad testnet tx',
    });

  // ── 1. Passkey-signed mandate, relayed ──────────────────────────────────────
  const block = await publicClient.getBlock();
  const terms: MandateTerms = {
    agent: relayer,
    agentId: setup.agentId,
    permissions: [{ target: config.target, selector: JUDGE_V2_SELECTOR }],
    maxPerCall: MAX_PER_CALL,
    budget: BUDGET,
    expiresAt: block.timestamp + 3600n,
  };
  const createAuth = passkey.sign(await sdk.createChallenge(passkey.publicKey, terms));
  const createData = encode.createMandate(passkey.publicKey, terms, createAuth);
  const create = await send(createData, VAULT_FUNDING, await estimate(publicClient, relayer, config.mandates, createData, VAULT_FUNDING, MAX_OWNER_GAS));
  if (create.receipt.status !== 'success') {
    push(1, 'Create mandate', 'The passkey-signed mandate was rejected on-chain.', 'success', create);
    return { steps, agentId: setup.agentId.toString(), mandateId: '', setupTx: setup.registrationTx };
  }
  const mandateId = (await publicClient.readContract({
    address: config.mandates,
    abi: AgentMandatesABI,
    functionName: 'mandateCount',
  })) as bigint;
  push(
    1,
    'Create mandate',
    `Mandate #${mandateId}: a P-256 passkey signed it as a WebAuthn assertion and Monad's P-256 precompile verified it. The agent is ERC-8004 #${setup.agentId}; it may call doSomething() on the demo target only, 0.0001 MON per call, 0.0005 MON in total, for 1 hour.`,
    'success',
    create
  );

  // ── 2. Allowed call ─────────────────────────────────────────────────────────
  const execData = (target: Address, data: Hex, value: bigint) =>
    encodeFunctionData({ abi: AgentMandatesABI, functionName: 'execute', args: [mandateId, target, data, value] });
  const allowedData = execData(config.target, call(42n), ALLOWED_VALUE);
  const allowed = await send(allowedData, 0n, await estimate(publicClient, relayer, config.mandates, allowedData, 0n, MAX_EXECUTE_GAS));
  push(2, 'Allowed call', 'The agent spends 0.00005 MON on doSomething(). The contract checks the signed terms and the ERC-8004 identity, then forwards the call.', 'success', allowed);

  // ── 3-4. Out-of-policy calls, sent anyway so the reverts are on the explorer ─
  const blocked = async (n: number, name: string, description: string, target: Address, data: Hex, value: bigint) => {
    const check = await sdk.checkAction(mandateId, relayer, target, data, value);
    const r = await send(execData(target, data, value), 0n, BLOCKED_CALL_GAS);
    push(n, name, description, 'reverted', r, check.allowed ? undefined : `${check.reason}()`);
  };
  await blocked(3, 'Overspend', 'The agent tries 0.001 MON, 10x its per-call cap.', config.target, call(1n), OVERSPEND_VALUE);
  await blocked(4, 'Rogue target', 'The agent calls 0x…dEaD, a contract the passkey never granted.', ROGUE_TARGET, call(1n), 0n);

  // ── 5. Passkey-signed revoke, relayed ───────────────────────────────────────
  const revokeData = encode.revoke(mandateId, passkey.sign(await sdk.revokeChallenge(passkey.publicKey, mandateId)));
  const revoke = await send(revokeData, 0n, await estimate(publicClient, relayer, config.mandates, revokeData, 0n, MAX_OWNER_GAS));
  push(5, 'Owner revokes', 'The same passkey signs a revoke and the relayer submits it. The owner never needs MON.', 'success', revoke);

  // ── 6. Agent after revoke ───────────────────────────────────────────────────
  await blocked(6, 'Call after revoke', 'The agent retries the call that worked in step 2.', config.target, call(2n), ALLOWED_VALUE);

  return { steps, agentId: setup.agentId.toString(), mandateId: mandateId.toString(), setupTx: setup.registrationTx };
}
