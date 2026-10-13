import {
  encodeFunctionData,
  formatEther,
  formatUnits,
  isAddress,
  parseAbiItem,
  parseEther,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { AgentMandates, MandateCallFailedError, MandateDeniedError } from './client.js';

const ERC20_DECIMALS_ABI = [
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
] as const;

/** A tool in the JSON-Schema shape used by Claude, OpenAI and most agent frameworks. */
export interface AgentTool {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  run(input: any): Promise<unknown>;
}

const callProps = {
  target: { type: 'string', description: 'Contract or address to call (0x...)' },
  functionSignature: { type: 'string', description: 'e.g. "transfer(address,uint256)". Omit for a plain MON transfer.' },
  args: { type: 'array', items: {}, description: 'Arguments for the function' },
  valueMON: { type: 'string', description: 'Native MON to send, e.g. "0.01"' },
};

/**
 * Tools that let any LLM agent act through its mandate: inspect limits, dry-run, execute and pay.
 * Pass `tools.map(({ run, ...t }) => t)` to the model and dispatch tool calls to `run`.
 * Denials come back as data ({ ok: false, blockedBy }), so the model can explain them instead of retrying.
 */
export function mandateTools(mandates: AgentMandates, mandateId: bigint): AgentTool[] {
  const agent = () => {
    const a = mandates.walletClient?.account?.address;
    if (!a) throw new Error('mandateTools needs an AgentMandates client with the agent wallet');
    return a;
  };

  const build = (input: { target: string; functionSignature?: string; args?: unknown[]; valueMON?: string }) => {
    if (!isAddress(input.target)) throw new Error(`Invalid target: ${input.target}`);
    let data: Hex = '0x';
    if (input.functionSignature) {
      const item = parseAbiItem(`function ${input.functionSignature}`) as any;
      data = encodeFunctionData({ abi: [item], functionName: item.name, args: input.args ?? [] });
    }
    return { target: input.target as Address, data, value: parseEther(input.valueMON || '0') };
  };

  const guarded = async (fn: () => Promise<{ hash: Hex }>) => {
    try {
      return { ok: true, transactionHash: (await fn()).hash };
    } catch (e) {
      if (e instanceof MandateDeniedError) return { ok: false, blockedBy: e.reason };
      if (e instanceof MandateCallFailedError) {
        return {
          ok: false,
          failed: e.reason,
          ...(e.targetReason ? { targetReason: e.targetReason } : {}),
          note: 'The mandate allows this, but it would revert, so nothing was sent. Check the arguments.',
        };
      }
      throw e;
    }
  };

  // decimals() read from the token itself, never from the model. Only successful reads are cached.
  const decimalsCache = new Map<string, number>();
  const tokenDecimals = async (token: Address): Promise<number> => {
    const hit = decimalsCache.get(token.toLowerCase());
    if (hit !== undefined) return hit;
    let decimals: number;
    try {
      decimals = Number(
        await mandates.publicClient.readContract({ address: token, abi: ERC20_DECIMALS_ABI, functionName: 'decimals' })
      );
    } catch (e: any) {
      throw new Error(`Could not read decimals() of token ${token}, so the amount cannot be scaled safely: ${e?.shortMessage ?? e?.message ?? e}`);
    }
    decimalsCache.set(token.toLowerCase(), decimals);
    return decimals;
  };

  return [
    {
      name: 'mandate_status',
      description: 'What this agent may do: allowed calls, MON and token caps, remaining budgets, expiry. Call before planning a spend.',
      input_schema: { type: 'object', properties: {} },
      async run() {
        const [m, permissions, tokens, active] = await Promise.all([
          mandates.getMandate(mandateId),
          mandates.getPermissions(mandateId),
          mandates.getTokens(mandateId),
          mandates.isActive(mandateId),
        ]);
        const tokenBudgets = await Promise.all(
          tokens.map(async (token) => {
            const [t, decimals] = await Promise.all([
              mandates.getTokenAllowance(mandateId, token),
              tokenDecimals(token).catch(() => undefined),
            ]);
            const units = { maxPerCall: t.maxPerCall.toString(), remaining: (t.budget - t.spent).toString(), vault: t.balance.toString() };
            if (decimals === undefined) {
              return { token, decimals: null, units, note: "decimals() could not be read; amounts are in base units and pay_token will refuse this token" };
            }
            // Whole tokens, the same unit pay_token's `amount` takes.
            return {
              token,
              decimals,
              maxPerCall: formatUnits(t.maxPerCall, decimals),
              remaining: formatUnits(t.budget - t.spent, decimals),
              vault: formatUnits(t.balance, decimals),
              units,
            };
          })
        );
        return {
          active,
          maxPerCallMON: formatEther(m.maxPerCall),
          remainingBudgetMON: formatEther(m.budget - m.spent),
          vaultMON: formatEther(m.balance),
          expiresAt: m.expiresAt === 0n ? 'never' : new Date(Number(m.expiresAt) * 1000).toISOString(),
          permissions: permissions.map((p) => ({ target: p.target, selector: p.selector })),
          tokenBudgets,
        };
      },
    },
    {
      name: 'check_action',
      description: 'Dry-run a call against the on-chain mandate. Returns allowed or the exact rule that blocks it. Sends nothing.',
      input_schema: { type: 'object', properties: callProps, required: ['target'] },
      async run(input) {
        const c = build(input);
        return mandates.checkAction(mandateId, agent(), c.target, c.data, c.value);
      },
    },
    {
      name: 'execute_action',
      description: 'Execute a call through the mandate contract. Disallowed calls are refused before any gas is spent.',
      input_schema: { type: 'object', properties: callProps, required: ['target'] },
      async run(input) {
        const c = build(input);
        return guarded(() => mandates.execute(mandateId, c.target, c.data, c.value));
      },
    },
    {
      name: 'pay_token',
      description:
        "Pay an allowed payee in an ERC-20 from the mandate's token vault, within the signed per-token caps. " +
        "The token's decimals are read on-chain.",
      input_schema: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          to: { type: 'string' },
          amount: { type: 'string', description: 'Whole tokens, e.g. "2.5"' },
        },
        required: ['token', 'to', 'amount'],
      },
      // A `decimals` input from older callers is ignored: the token contract is the only source.
      async run({ token, to, amount }) {
        if (!isAddress(token) || !isAddress(to)) throw new Error('token and to must be addresses');
        const units = parseUnits(String(amount), await tokenDecimals(token));
        return guarded(() => mandates.payToken(mandateId, token, to, units));
      },
    },
  ];
}
