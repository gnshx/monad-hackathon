#!/usr/bin/env node
/**
 * AgentTrust MCP server.
 *
 * Gives any MCP client (Claude Desktop, Claude Code, Cursor, custom agents) a wallet whose
 * authority is bounded on-chain by a passkey-signed AgentMandates mandate. The agent key this
 * server holds can only do what the human's mandate allows: allowlisted contracts and functions,
 * a per-call cap, a total budget and an expiry. A prompt-injected or confused model can at worst
 * spend the remaining budget on the allowed calls, and the owner can revoke with one passkey tap.
 *
 * Environment:
 *   AGENTTRUST_CONTRACT   AgentMandates address
 *   AGENTTRUST_MANDATE_ID mandate this agent acts under
 *   AGENT_PRIVATE_KEY     the agent's hot key (the mandate's `agent`)
 *   AGENTTRUST_RPC_URL    defaults to Monad testnet
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  isHex,
  parseAbiItem,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { AgentMandates, MandateDeniedError } from '@agenttrust/sdk';

const RPC_URL = process.env.AGENTTRUST_RPC_URL || 'https://testnet-rpc.monad.xyz';
const CONTRACT = process.env.AGENTTRUST_CONTRACT as Address | undefined;
const MANDATE_ID = process.env.AGENTTRUST_MANDATE_ID;
const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
const EXPLORER = process.env.AGENTTRUST_EXPLORER || 'https://testnet.monadexplorer.com';

if (!CONTRACT || !isAddress(CONTRACT) || !MANDATE_ID || !AGENT_KEY) {
  console.error('agenttrust-mcp: set AGENTTRUST_CONTRACT, AGENTTRUST_MANDATE_ID and AGENT_PRIVATE_KEY');
  process.exit(1);
}

const mandateId = BigInt(MANDATE_ID);
const account = privateKeyToAccount(AGENT_KEY);
const publicClient = createPublicClient({ transport: http(RPC_URL) }) as PublicClient;
const chainId = await publicClient.getChainId();
const chain = {
  id: chainId,
  name: chainId === 10143 ? 'Monad Testnet' : `chain ${chainId}`,
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};
const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) });
const mandates = new AgentMandates(CONTRACT, publicClient, walletClient);

const server = new McpServer({ name: 'agenttrust', version: '0.1.0' });

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

server.tool(
  'mandate_status',
  'Show what this agent is allowed to do: allowed contracts and functions, per-call cap, remaining budget, vault balance and expiry. Call this before planning any spend.',
  {},
  async () => {
    const [m, permissions, active] = await Promise.all([
      mandates.getMandate(mandateId),
      mandates.getPermissions(mandateId),
      mandates.isActive(mandateId),
    ]);
    return text({
      mandateId: mandateId.toString(),
      active,
      agent: m.agent,
      agentId: m.agentId.toString(),
      maxPerCallMON: formatEther(m.maxPerCall),
      remainingBudgetMON: formatEther(m.budget - m.spent),
      spentMON: formatEther(m.spent),
      vaultBalanceMON: formatEther(m.balance),
      expiresAt: m.expiresAt === 0n ? 'never' : new Date(Number(m.expiresAt) * 1000).toISOString(),
      permissions: permissions.map((p) => ({
        target: p.target,
        selector: p.selector === '0x00000000' ? 'any' : p.selector,
      })),
    });
  }
);

const callShape = {
  target: z.string().describe('Contract or address to call (0x...)'),
  functionSignature: z
    .string()
    .optional()
    .describe('Solidity signature, e.g. "transfer(address,uint256)". Omit for a plain MON transfer.'),
  args: z.array(z.union([z.string(), z.number(), z.boolean()])).optional().describe('Arguments for the function'),
  data: z.string().optional().describe('Raw calldata (0x...), instead of functionSignature + args'),
  valueMON: z.string().default('0').describe('Native MON to send, as a decimal string, e.g. "0.01"'),
};

function buildCall(input: { target: string; functionSignature?: string; args?: unknown[]; data?: string; valueMON: string }) {
  if (!isAddress(input.target)) throw new Error(`Invalid target address: ${input.target}`);
  let data: Hex = '0x';
  if (input.data) {
    if (!isHex(input.data)) throw new Error('data must be 0x-prefixed hex');
    data = input.data;
  } else if (input.functionSignature) {
    const item = parseAbiItem(`function ${input.functionSignature}`) as any;
    data = encodeFunctionData({ abi: [item], functionName: item.name, args: input.args ?? [] });
  }
  return { target: input.target as Address, data, value: parseEther(input.valueMON) };
}

server.tool(
  'check_action',
  'Dry-run a call against the on-chain mandate without sending anything. Returns allowed=true, or the exact rule that would block it.',
  callShape,
  async (input) => {
    const c = buildCall(input);
    const res = await mandates.checkAction(mandateId, account.address, c.target, c.data, c.value);
    return text({ ...res, target: c.target, valueMON: input.valueMON });
  }
);

server.tool(
  'execute_action',
  'Execute a call through the AgentMandates contract. The contract enforces the mandate; disallowed calls are refused before any gas is spent.',
  callShape,
  async (input) => {
    const c = buildCall(input);
    try {
      const { hash } = await mandates.execute(mandateId, c.target, c.data, c.value);
      return text({ ok: true, transactionHash: hash, ...(chainId === 10143 ? { explorer: `${EXPLORER}/tx/${hash}` } : {}) });
    } catch (e) {
      if (e instanceof MandateDeniedError) {
        return text({ ok: false, blockedBy: e.reason, note: 'The human owner did not authorize this. Do not retry with variations.' });
      }
      throw e;
    }
  }
);

await server.connect(new StdioServerTransport());
console.error(`agenttrust-mcp ready: mandate #${mandateId} on ${chain.name} as ${account.address}`);
