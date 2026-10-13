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
  BaseError,
  decodeEventLog,
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
  MANDATE_ERRORS,
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

/**
 * Gas limit for calls that must revert in the policy check. Locally they use ~35-60k, but on
 * Monad cold storage and cold account access (the ERC-8004 registry call) cost far more; the
 * Monad-priced worst case is ~127k. Each blocked call is simulated with this limit first.
 */
const BLOCKED_CALL_GAS = 150_000n;
/** Upper bounds when an estimate fails. Monad bills the limit, so estimates are preferred. */
const MAX_OWNER_GAS = 900_000n;
const MAX_EXECUTE_GAS = 300_000n;
/** Padded gas limit budget for a full run, including a one-off ERC-8004 registration. */
export const JUDGE_V2_RUN_GAS = 1_500_000n;

const EXPLORER = 'https://testnet.monadexplorer.com';
const ORIGIN = 'https://monad-hackathon-amber.vercel.app';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const MOCK_TARGET_SWITCH_ABI = [
  { type: 'function', name: 'shouldFail', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'setShouldFail', inputs: [{ type: 'bool' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

/** True when the error is the contract reverting, as opposed to the RPC or network failing. */
function isRevert(err: unknown): boolean {
  if (err instanceof BaseError) {
    const hit = err.walk((e: any) => /revert/i.test(String(e?.name || '')) || (typeof e?.data === 'string' && e.data.length >= 10));
    if (hit) return true;
  }
  return /execution reverted|reverted with/i.test(String((err as any)?.message || err));
}

/** The 4-byte revert data carried anywhere in a viem error chain, if any. */
function revertSelector(err: unknown): Hex | undefined {
  let found: Hex | undefined;
  const visit = (e: any, depth = 0) => {
    if (!e || depth > 8 || found) return;
    const d = typeof e.data === 'string' ? e.data : typeof e.data?.data === 'string' ? e.data.data : undefined;
    if (d && /^0x[0-9a-fA-F]{8}/.test(d)) found = d.slice(0, 10).toLowerCase() as Hex;
    visit(e.cause, depth + 1);
    if (e.error) visit(e.error, depth + 1);
  };
  visit(err);
  if (!found) {
    const m = String((err as any)?.message || '').match(/0x[0-9a-fA-F]{8}/);
    if (m && MANDATE_ERRORS[m[0].toLowerCase()]) found = m[0].toLowerCase() as Hex;
  }
  return found;
}

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

  // The relayer's earlier Judge Mode mandates record its agent ID on-chain, so a cold instance
  // can reuse it instead of minting a new identity.
  let previous: bigint | undefined;
  try {
    const ids = (await publicClient.readContract({
      address: mandates,
      abi: AgentMandatesABI,
      functionName: 'mandatesForAgent',
      args: [relayer],
    })) as readonly bigint[];
    if (ids.length) {
      const m = (await publicClient.readContract({
        address: mandates,
        abi: AgentMandatesABI,
        functionName: 'getMandate',
        args: [ids[ids.length - 1]],
      })) as { agentId: bigint };
      previous = m.agentId;
    }
  } catch {}

  for (const candidate of [configuredId ? BigInt(configuredId) : undefined, cachedAgentId, previous]) {
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
  let gas: bigint;
  try {
    gas = await estimate(publicClient, relayer, registry, data, 0n, 400_000n);
  } catch (err) {
    throw new Error(
      `The ERC-8004 registry at ${registry} would not register an identity for the relayer, so nothing was sent. Set JUDGE_AGENT_ID to an agent ID whose wallet is ${relayer}.`,
      { cause: err }
    );
  }
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
  let g: bigint;
  try {
    g = ((await publicClient.estimateGas({ account: from, to, data, value })) * 5n) / 4n;
  } catch (err) {
    // A call that would revert must not be broadcast at the ceiling; only RPC hiccups fall back.
    if (isRevert(err)) {
      const sel = revertSelector(err);
      throw new Error(`The contract would reject this step${sel && MANDATE_ERRORS[sel] ? ` (${MANDATE_ERRORS[sel]})` : ''}, so it was not sent.`);
    }
    return ceiling;
  }
  if (g > ceiling) throw new Error('This step needs more gas than Judge Mode allows, so it was not sent.');
  return g;
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
  // Read the ID from this transaction's MandateCreated event, not mandateCount (another grant
  // could land in between).
  let mandateId: bigint | undefined;
  for (const log of create.receipt.logs) {
    if (log.address.toLowerCase() !== config.mandates.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: AgentMandatesABI, data: log.data, topics: log.topics });
      if (ev.eventName === 'MandateCreated') {
        mandateId = (ev.args as { mandateId: bigint }).mandateId;
        break;
      }
    } catch {}
  }
  if (mandateId === undefined) throw new Error('Mandate created, but its ID could not be read from the receipt.');
  push(
    1,
    'Create mandate',
    `Mandate #${mandateId}: a P-256 passkey signed it as a WebAuthn assertion and Monad's P-256 precompile verified it. The agent is ERC-8004 #${setup.agentId}; it may call doSomething() on the demo target only, 0.0001 MON per call, 0.0005 MON in total, for 1 hour.`,
    'success',
    create
  );

  // ── 2. Allowed call ─────────────────────────────────────────────────────────
  // The demo MockTarget has a public failure switch; make sure nobody left it on.
  try {
    const failing = await publicClient.readContract({ address: config.target, abi: MOCK_TARGET_SWITCH_ABI, functionName: 'shouldFail' });
    if (failing) {
      const off = encodeFunctionData({ abi: MOCK_TARGET_SWITCH_ABI, functionName: 'setShouldFail', args: [false] });
      const h = await walletClient.sendTransaction({ account, chain: null, to: config.target, data: off, gas: 60_000n });
      await publicClient.waitForTransactionReceipt({ hash: h });
    }
  } catch {}
  const execData = (target: Address, data: Hex, value: bigint) =>
    encodeFunctionData({ abi: AgentMandatesABI, functionName: 'execute', args: [mandateId, target, data, value] });
  const allowedData = execData(config.target, call(42n), ALLOWED_VALUE);
  const allowed = await send(allowedData, 0n, await estimate(publicClient, relayer, config.mandates, allowedData, 0n, MAX_EXECUTE_GAS));
  push(2, 'Allowed call', 'The agent spends 0.00005 MON on doSomething(). The contract checks the signed terms and the ERC-8004 identity, then forwards the call.', 'success', allowed);

  // ── 3-4. Out-of-policy calls, sent anyway so the reverts are on the explorer ─
  const blocked = async (
    n: number,
    name: string,
    description: string,
    expected: string,
    target: Address,
    data: Hex,
    value: bigint
  ) => {
    const tx = execData(target, data, value);
    // Simulate with the exact gas limit first: the step is only sent if the contract itself
    // rejects it with the expected reason (not out of gas, not allowed).
    let reason: string | undefined;
    try {
      await publicClient.call({ account, to: config.mandates, data: tx, gas: BLOCKED_CALL_GAS });
    } catch (err) {
      const sel = revertSelector(err);
      reason = sel ? MANDATE_ERRORS[sel] : undefined;
      if (!reason && !isRevert(err)) throw err;
    }
    if (reason !== expected) {
      steps.push({
        step: n,
        name,
        description: `${description} Not sent: the contract would have ${reason ? `rejected it with ${reason}` : 'accepted it or run out of gas'}, not ${expected}.`,
        expectedOutcome: 'reverted',
        status: 'error',
        txHash: '0x' as Hex,
        explorerUrl: '',
        label: 'Live Monad testnet tx',
      });
      return;
    }
    const r = await send(tx, 0n, BLOCKED_CALL_GAS);
    push(n, name, description, 'reverted', r, `${expected}()`);
  };
  await blocked(3, 'Overspend', 'The agent tries 0.001 MON, 10x its per-call cap.', 'ExceedsPerCallLimit', config.target, call(1n), OVERSPEND_VALUE);
  await blocked(4, 'Rogue target', 'The agent calls 0x…dEaD, a contract the passkey never granted.', 'PermissionDenied', ROGUE_TARGET, call(1n), 0n);

  // ── 5. Passkey-signed revoke, relayed ───────────────────────────────────────
  const revokeData = encode.revoke(mandateId, passkey.sign(await sdk.revokeChallenge(passkey.publicKey, mandateId)));
  const revoke = await send(revokeData, 0n, await estimate(publicClient, relayer, config.mandates, revokeData, 0n, MAX_OWNER_GAS));
  push(5, 'Owner revokes', 'The same passkey signs a revoke and the relayer submits it. The owner never needs MON.', 'success', revoke);

  // ── 6. Agent after revoke ───────────────────────────────────────────────────
  await blocked(6, 'Call after revoke', 'The agent retries the call that worked in step 2.', 'MandateInactive', config.target, call(2n), ALLOWED_VALUE);

  return { steps, agentId: setup.agentId.toString(), mandateId: mandateId.toString(), setupTx: setup.registrationTx };
}
