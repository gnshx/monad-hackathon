import {
  decodeErrorResult,
  encodeAbiParameters,
  encodeFunctionData,
  isHex,
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
  /** 4-byte selector, or ANY_SELECTOR for any call (including plain transfers) to target, except the allowance calls the contract always refuses (approve, transferFrom, ...). */
  selector: Hex;
}

export interface TokenLimit {
  token: Address;
  /** In the token's smallest unit (e.g. 10_000_000n = 10 USDC with 6 decimals). */
  maxPerCall: bigint;
  budget: bigint;
}

export interface MandateTerms {
  agent: Address;
  agentId: bigint;
  /** Allowed calls. A (payee, ANY_SELECTOR) entry also allows token payments to payee. */
  permissions: Permission[];
  /** Native MON caps. */
  maxPerCall: bigint;
  budget: bigint;
  /** Unix seconds; 0n = never. */
  expiresAt: bigint;
  /** ERC-20 spending caps, paid out with payToken(). Optional. */
  tokenLimits?: TokenLimit[];
}

export interface TokenAllowance {
  maxPerCall: bigint;
  budget: bigint;
  spent: bigint;
  balance: bigint;
  enabled: boolean;
}

/** Fill optional fields so terms match the on-chain struct exactly. */
export function normalizeTerms(t: MandateTerms): Required<MandateTerms> {
  return { ...t, tokenLimits: t.tokenLimits ?? [] };
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

/**
 * AgentMandates custom errors, keyed by their 4-byte selector (lowercase hex). The selector is
 * taken over the full signature, so `CallFailed(bytes)` maps from 0xa5fa8d2b.
 */
export const MANDATE_ERRORS: Record<string, string> = Object.fromEntries(
  AgentMandatesABI.filter((x) => x.type === 'error').map((e) => [
    toFunctionSelector(`${e.name}(${e.inputs.map((i) => i.type).join(',')})`),
    e.name,
  ])
);

const TYPEHASH = {
  create: keccak256(toHex('AgentMandates.Create.v1')),
  revoke: keccak256(toHex('AgentMandates.Revoke.v1')),
  revokeAll: keccak256(toHex('AgentMandates.RevokeAll.v1')),
  withdraw: keccak256(toHex('AgentMandates.Withdraw.v1')),
  withdrawToken: keccak256(toHex('AgentMandates.WithdrawToken.v1')),
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
  const tokenLimitsHash = keccak256(
    encodeAbiParameters(
      [{
        type: 'tuple[]',
        components: [{ name: 'token', type: 'address' }, { name: 'maxPerCall', type: 'uint256' }, { name: 'budget', type: 'uint256' }],
      }],
      [(t.tokenLimits ?? []).map((l) => ({ token: l.token, maxPerCall: l.maxPerCall, budget: l.budget }))]
    )
  );
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }, { type: 'address' },
        { type: 'uint256' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint64' },
        { type: 'bytes32' }, { type: 'uint256' },
      ],
      [
        TYPEHASH.create, BigInt(d.chainId), d.contract, ownerKey, t.agent,
        t.agentId, permissionsHash, t.maxPerCall, t.budget, t.expiresAt,
        tokenLimitsHash, nonce,
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

export function withdrawTokenDigest(
  d: Domain, ownerKey: Hex, mandateId: bigint, token: Address, to: Address, amount: bigint, nonce: bigint
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }, { type: 'uint256' },
        { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' },
      ],
      [TYPEHASH.withdrawToken, BigInt(d.chainId), d.contract, ownerKey, mandateId, token, to, amount, nonce]
    )
  );
}

/** Calldata for owner actions, so any relayer can submit them. */
export const encode = {
  createMandate: (pk: PasskeyPublicKey, terms: MandateTerms, auth: WebAuthnAssertion) =>
    encodeFunctionData({ abi: AgentMandatesABI, functionName: 'createMandate', args: [pk, normalizeTerms(terms), auth] }),
  revoke: (mandateId: bigint, auth: WebAuthnAssertion) =>
    encodeFunctionData({ abi: AgentMandatesABI, functionName: 'revoke', args: [mandateId, auth] }),
  revokeAll: (ownerKey: Hex, auth: WebAuthnAssertion) =>
    encodeFunctionData({ abi: AgentMandatesABI, functionName: 'revokeAll', args: [ownerKey, auth] }),
  withdraw: (mandateId: bigint, to: Address, amount: bigint, auth: WebAuthnAssertion) =>
    encodeFunctionData({ abi: AgentMandatesABI, functionName: 'withdraw', args: [mandateId, to, amount, auth] }),
  withdrawToken: (mandateId: bigint, token: Address, to: Address, amount: bigint, auth: WebAuthnAssertion) =>
    encodeFunctionData({ abi: AgentMandatesABI, functionName: 'withdrawToken', args: [mandateId, token, to, amount, auth] }),
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

  async mandatesOf(ownerKey: Hex): Promise<readonly bigint[]> {
    return this.publicClient.readContract({
      address: this.address, abi: AgentMandatesABI, functionName: 'mandatesOf', args: [ownerKey],
    });
  }

  async mandatesForAgent(agent: Address): Promise<readonly bigint[]> {
    return this.publicClient.readContract({
      address: this.address, abi: AgentMandatesABI, functionName: 'mandatesForAgent', args: [agent],
    });
  }

  async nonce(ownerKey: Hex): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.address, abi: AgentMandatesABI, functionName: 'nonces', args: [ownerKey],
    });
  }

  /** The owner's current epoch. A mandate whose `epoch` differs was ended by revokeAll(). */
  async epoch(ownerKey: Hex): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.address, abi: AgentMandatesABI, functionName: 'epochs', args: [ownerKey],
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

  /** Token-payment counterpart of checkAction(). */
  async checkPayment(mandateId: bigint, agent: Address, token: Address, to: Address, amount: bigint): Promise<CheckResult> {
    const [allowed, reason] = await this.publicClient.readContract({
      address: this.address, abi: AgentMandatesABI, functionName: 'checkPayment',
      args: [mandateId, agent, token, to, amount],
    });
    return allowed ? { allowed } : { allowed, reason: MANDATE_ERRORS[reason] ?? reason };
  }

  async getTokens(mandateId: bigint): Promise<readonly Address[]> {
    return this.publicClient.readContract({
      address: this.address, abi: AgentMandatesABI, functionName: 'getTokens', args: [mandateId],
    });
  }

  async getTokenAllowance(mandateId: bigint, token: Address): Promise<TokenAllowance> {
    return (await this.publicClient.readContract({
      address: this.address, abi: AgentMandatesABI, functionName: 'getTokenAllowance', args: [mandateId, token],
    })) as TokenAllowance;
  }

  async withdrawTokenChallenge(owner: PasskeyPublicKey, mandateId: bigint, token: Address, to: Address, amount: bigint): Promise<Hex> {
    const key = ownerKeyOf(owner);
    return withdrawTokenDigest(await this.domain(), key, mandateId, token, to, amount, await this.nonce(key));
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

  /**
   * Submit a signed owner action from this client's wallet (acting as relayer). If the contract
   * would reject it (stale nonce, bad signature, invalid terms...), this throws
   * MandateDeniedError with the contract's reason and sends nothing.
   */
  async relay(data: Hex, value = 0n): Promise<Hex> {
    const wallet = this.requireWallet();
    const hash = await wallet.sendTransaction({
      account: wallet.account!, chain: wallet.chain, to: this.address, data, value,
      gas: await this.gasFor(wallet.account!.address, data, value, 1_200_000n),
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`Relayed transaction reverted: ${hash}`);
    return hash;
  }

  /**
   * Run a call as the agent. Pre-checks with checkAction() so a disallowed call fails here with
   * a readable reason instead of burning gas on a revert. A call the mandate allows but the
   * target would reject throws MandateCallFailedError, also before anything is sent.
   */
  async execute(mandateId: bigint, target: Address, data: Hex, value = 0n): Promise<{ hash: Hex }> {
    const wallet = this.requireWallet();
    const check = await this.checkAction(mandateId, wallet.account!.address, target, data, value);
    if (!check.allowed) throw new MandateDeniedError(check.reason ?? 'denied');
    const args = [mandateId, target, data, value] as const;
    const hash = await wallet.writeContract({
      account: wallet.account!, chain: wallet.chain, address: this.address, abi: AgentMandatesABI,
      functionName: 'execute', args,
      gas: await this.gasFor(
        wallet.account!.address,
        encodeFunctionData({ abi: AgentMandatesABI, functionName: 'execute', args }),
        0n,
        300_000n
      ),
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`execute reverted: ${hash}`);
    return { hash };
  }

  /** Pay an allowlisted payee from the mandate's token vault, as the agent. Pre-checked like execute(). */
  async payToken(mandateId: bigint, token: Address, to: Address, amount: bigint): Promise<{ hash: Hex }> {
    const wallet = this.requireWallet();
    const check = await this.checkPayment(mandateId, wallet.account!.address, token, to, amount);
    if (!check.allowed) throw new MandateDeniedError(check.reason ?? 'denied');
    const args = [mandateId, token, to, amount] as const;
    const hash = await wallet.writeContract({
      account: wallet.account!, chain: wallet.chain, address: this.address, abi: AgentMandatesABI,
      functionName: 'payToken', args,
      gas: await this.gasFor(
        wallet.account!.address,
        encodeFunctionData({ abi: AgentMandatesABI, functionName: 'payToken', args }),
        0n,
        300_000n
      ),
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`payToken reverted: ${hash}`);
    return { hash };
  }

  /** Fund a mandate's token vault from this wallet (approves, then deposits). */
  async depositToken(mandateId: bigint, token: Address, amount: bigint): Promise<{ hash: Hex }> {
    const wallet = this.requireWallet();
    const from = wallet.account!.address;
    const approveArgs = [this.address, amount] as const;
    const approve = await wallet.writeContract({
      account: wallet.account!, chain: wallet.chain, address: token, abi: ERC20_APPROVE_ABI,
      functionName: 'approve', args: approveArgs,
      gas: await this.gasFor(
        from,
        encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: approveArgs }),
        0n,
        100_000n,
        token
      ),
    });
    const approveReceipt = await this.publicClient.waitForTransactionReceipt({ hash: approve });
    if (approveReceipt.status !== 'success') throw new Error(`approve reverted, deposit not sent: ${approve}`);
    // Estimated only now: before the approval lands, depositToken would revert on the allowance.
    const args = [mandateId, token, amount] as const;
    const hash = await wallet.writeContract({
      account: wallet.account!, chain: wallet.chain, address: this.address, abi: AgentMandatesABI,
      functionName: 'depositToken', args,
      gas: await this.gasFor(
        from,
        encodeFunctionData({ abi: AgentMandatesABI, functionName: 'depositToken', args }),
        0n,
        300_000n
      ),
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`depositToken reverted: ${hash}`);
    return { hash };
  }

  /**
   * Gas limit from an estimate plus 25% headroom, capped at `ceiling`. Monad bills the gas limit,
   * not the gas used, so a flat ceiling would overcharge every call.
   *
   * If the estimate fails because the transaction would revert, this throws instead of sending a
   * known-failing transaction (billed at the full limit): MandateDeniedError or
   * MandateCallFailedError when the revert decodes as an AgentMandates error, otherwise the
   * original error. Only transport/RPC failures (timeouts, rate limits, HTTP errors) fall back to
   * the ceiling.
   */
  private async gasFor(from: Address, data: Hex, value: bigint, ceiling: bigint, to: Address = this.address): Promise<bigint> {
    let estimate: bigint;
    try {
      estimate = await this.publicClient.estimateGas({ account: from, to, data, value });
    } catch (err) {
      const revert = revertOf(err);
      if (!revert) return ceiling;
      throw (to === this.address ? decodeMandateRevert(revert.data) : undefined) ?? err;
    }
    const padded = (estimate * 5n) / 4n;
    return padded < ceiling ? padded : ceiling;
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

/**
 * The mandate allows the call, but it would revert anyway: the target rejected it (`CallFailed`,
 * with the target's revert data) or a token transfer failed (`TransferFailed`). Thrown before
 * anything is sent, so no gas is spent. Unlike MandateDeniedError this is not a policy denial.
 */
export class MandateCallFailedError extends Error {
  /** The target's own revert reason, when its revert data is an Error(string) or Panic(uint256). */
  readonly targetReason?: string;

  constructor(readonly reason: 'CallFailed' | 'TransferFailed', readonly returnData: Hex = '0x') {
    const targetReason = describeRevert(returnData);
    super(
      reason === 'CallFailed'
        ? `The target rejected the call${targetReason ? `: ${targetReason}` : returnData !== '0x' ? ` (revert data ${returnData})` : ''}`
        : 'The token transfer failed (TransferFailed)'
    );
    this.name = 'MandateCallFailedError';
    this.targetReason = targetReason;
  }
}

/**
 * Turn AgentMandates revert data into the matching typed error: MandateCallFailedError for
 * CallFailed/TransferFailed, MandateDeniedError for any other contract error. Undefined when the
 * data is missing or is not an AgentMandates error.
 */
export function decodeMandateRevert(data: Hex | undefined): MandateDeniedError | MandateCallFailedError | undefined {
  if (!data || !isHex(data) || data.length < 10) return undefined;
  try {
    const decoded = decodeErrorResult({ abi: AgentMandatesABI, data });
    // viem also matches the built-in Error(string) / Panic(uint256), which are not mandate errors.
    const errorName: string = decoded.errorName;
    if (errorName === 'CallFailed') return new MandateCallFailedError('CallFailed', (decoded.args as readonly [Hex])[0]);
    if (errorName === 'TransferFailed') return new MandateCallFailedError('TransferFailed');
    if (errorName === 'Error' || errorName === 'Panic') return undefined;
    return new MandateDeniedError(errorName);
  } catch {
    return undefined;
  }
}

/** Error(string) / Panic(uint256) revert data as text, or undefined. */
function describeRevert(data: Hex): string | undefined {
  if (!isHex(data) || data.length < 10) return undefined;
  try {
    const { errorName, args } = decodeErrorResult({ abi: [], data });
    if (errorName === 'Error') return String(args?.[0]);
    if (errorName === 'Panic') return `Panic(0x${BigInt(args?.[0] as bigint).toString(16)})`;
  } catch {
    // custom error of the target: keep the raw data
  }
  return undefined;
}

/**
 * Whether an estimateGas error means "this transaction would revert", and its revert data if the
 * node returned any. Undefined for transport/RPC failures. Duck-typed over the cause chain so it
 * works whatever viem copy built the client.
 */
function revertOf(err: unknown): { data?: Hex } | undefined {
  let reverted = false;
  let data: Hex | undefined;
  const seen = new Set<unknown>();
  for (let e: any = err; e && typeof e === 'object' && !seen.has(e); e = e.cause) {
    seen.add(e);
    const text = [e.details, e.shortMessage, e.shortMessage === undefined ? e.message : undefined]
      .filter((x) => typeof x === 'string')
      .join(' ');
    if (e.name === 'ExecutionRevertedError' || e.name === 'ContractFunctionRevertedError' || e.code === 3 || /revert/i.test(text)) {
      reverted = true;
    }
    const d = typeof e.data === 'string' ? e.data : typeof e.data?.data === 'string' ? e.data.data : undefined;
    if (!data && d && isHex(d) && d.length >= 10) data = d as Hex;
  }
  return reverted || data ? { data } : undefined;
}

const ERC20_APPROVE_ABI = [
  {
    type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }],
  },
] as const;
