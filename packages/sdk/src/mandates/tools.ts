import {
  encodeFunctionData,
  formatEther,
  isAddress,
  parseAbiItem,
  parseEther,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { AgentMandates, MandateDeniedError } from './client.js';

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
      throw e;
    }
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
            const t = await mandates.getTokenAllowance(mandateId, token);
            return { token, maxPerCall: t.maxPerCall.toString(), remaining: (t.budget - t.spent).toString(), vault: t.balance.toString() };
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
      description: "Pay an allowed payee in an ERC-20 from the mandate's token vault, within the signed per-token caps.",
      input_schema: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          to: { type: 'string' },
          amount: { type: 'string', description: 'Whole tokens, e.g. "2.5"' },
          decimals: { type: 'number', description: 'Token decimals, e.g. 6 for USDC' },
        },
        required: ['token', 'to', 'amount', 'decimals'],
      },
      async run({ token, to, amount, decimals }) {
        if (!isAddress(token) || !isAddress(to)) throw new Error('token and to must be addresses');
        return guarded(() => mandates.payToken(mandateId, token, to, parseUnits(String(amount), Number(decimals))));
      },
    },
  ];
}
