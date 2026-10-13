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
  formatUnits,
  http,
  isAddress,
  isHex,
  parseAbiItem,
  parseEther,
  parseUnits,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { AgentMandates, MandateDeniedError, verifyReceipt } from '@agenttrust/sdk';

export interface McpServerConfig {
  contractAddress: Address;
  mandateId: bigint;
  account: ReturnType<typeof privateKeyToAccount>;
  publicClient: PublicClient;
  walletClient?: WalletClient;
  explorer?: string;
  chainId?: number;
}

export function createAgentTrustMcpServer(config: McpServerConfig): McpServer {
  const { contractAddress, mandateId, account, publicClient, explorer = 'https://testnet.monadexplorer.com' } = config;
  const chainId = config.chainId ?? 10143;
  const chain = {
    id: chainId,
    name: chainId === 10143 ? 'Monad Testnet' : `chain ${chainId}`,
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [publicClient.transport?.url || 'https://testnet-rpc.monad.xyz'] } },
  };

  const walletClient =
    config.walletClient ??
    createWalletClient({ account, chain, transport: http(publicClient.transport?.url || 'https://testnet-rpc.monad.xyz') });

  const mandates = new AgentMandates(contractAddress, publicClient, walletClient);
  const server = new McpServer({ name: 'agenttrust', version: '0.1.0' });

  const text = (value: unknown) => ({
    content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  });

  const metaCache = new Map<string, { symbol: string; decimals: number }>();
  async function tokenMeta(token: Address) {
    const hit = metaCache.get(token);
    if (hit) return hit;
    const abi = [
      { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
      { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
    ] as const;
    const [decimals, symbol] = await Promise.all([
      publicClient.readContract({ address: token, abi, functionName: 'decimals' }).catch(() => 18),
      publicClient.readContract({ address: token, abi, functionName: 'symbol' }).catch(() => 'TOKEN'),
    ]);
    const meta = { symbol, decimals: Number(decimals) };
    metaCache.set(token, meta);
    return meta;
  }

  async function getMandateStatus(targetMandateId?: bigint) {
    const id = targetMandateId ?? mandateId;
    const [m, permissions, active, tokens] = await Promise.all([
      mandates.getMandate(id),
      mandates.getPermissions(id),
      mandates.isActive(id),
      mandates.getTokens(id),
    ]);
    const tokenBudgets = await Promise.all(
      tokens.map(async (token) => {
        const [ta, meta] = await Promise.all([mandates.getTokenAllowance(id, token), tokenMeta(token)]);
        return {
          token,
          symbol: meta.symbol,
          maxPerCall: formatUnits(ta.maxPerCall, meta.decimals),
          remainingBudget: formatUnits(ta.budget - ta.spent, meta.decimals),
          vaultBalance: formatUnits(ta.balance, meta.decimals),
        };
      })
    );
    return {
      mandateId: id.toString(),
      active,
      revoked: m.revoked || !active,
      agent: m.agent,
      agentId: m.agentId.toString(),
      limits: {
        maxPerCallMON: formatEther(m.maxPerCall),
        remainingBudgetMON: formatEther(m.budget - m.spent),
        spentMON: formatEther(m.spent),
        vaultBalanceMON: formatEther(m.balance),
      },
      maxPerCallMON: formatEther(m.maxPerCall),
      remainingBudgetMON: formatEther(m.budget - m.spent),
      spentMON: formatEther(m.spent),
      vaultBalanceMON: formatEther(m.balance),
      expiresAt: m.expiresAt === 0n ? 'never' : new Date(Number(m.expiresAt) * 1000).toISOString(),
      permissions: permissions.map((p) => ({
        target: p.target,
        selector: p.selector === '0x00000000' ? 'any (also an allowed token payee)' : p.selector,
      })),
      tokenBudgets,
    };
  }

  const callShape = {
    target: z.string().describe('Contract or address to call (0x...)'),
    selector: z.string().optional().describe('4-byte function selector (e.g. 0xa6b206bf)'),
    callData: z.string().optional().describe('Raw calldata hex (0x...)'),
    functionSignature: z
      .string()
      .optional()
      .describe('Solidity signature, e.g. "transfer(address,uint256)". Omit for a plain MON transfer.'),
    args: z.array(z.union([z.string(), z.number(), z.boolean()])).optional().describe('Arguments for the function'),
    data: z.string().optional().describe('Raw calldata (0x...), instead of functionSignature + args'),
    value: z.string().optional().describe('Native MON to send, as a decimal string, e.g. "0.01"'),
    valueMON: z.string().optional().describe('Native MON to send, as a decimal string, e.g. "0.01"'),
  };

  function buildCall(input: {
    target: string;
    selector?: string;
    callData?: string;
    functionSignature?: string;
    args?: unknown[];
    data?: string;
    value?: string;
    valueMON?: string;
  }) {
    if (!isAddress(input.target)) throw new Error(`Invalid target address: ${input.target}`);
    let data: Hex = '0x';
    if (input.callData) {
      if (!isHex(input.callData)) throw new Error('callData must be 0x-prefixed hex');
      data = input.callData;
    } else if (input.data) {
      if (!isHex(input.data)) throw new Error('data must be 0x-prefixed hex');
      data = input.data;
    } else if (input.selector && isHex(input.selector)) {
      data = input.selector as Hex;
    } else if (input.functionSignature) {
      const item = parseAbiItem(`function ${input.functionSignature}`) as any;
      data = encodeFunctionData({ abi: [item], functionName: item.name, args: input.args ?? [] });
    }
    const valStr = input.value ?? input.valueMON ?? '0';
    return { target: input.target as Address, data, value: parseEther(valStr), valStr };
  }

  // 1. Prompt 2 Primary Tool: agenttrust_check_mandate
  server.tool(
    'agenttrust_check_mandate',
    "Returns the mandate's limits, expiry, and revoked status read from chain.",
    {
      mandateId: z.string().optional().describe('Mandate ID (defaults to configured AGENTTRUST_MANDATE_ID)'),
    },
    async ({ mandateId: customId }) => {
      const status = await getMandateStatus(customId ? BigInt(customId) : undefined);
      return text(status);
    }
  );

  // Alias: mandate_status
  server.tool(
    'mandate_status',
    'Show what this agent is allowed to do: allowed contracts and functions, per-call cap, remaining budget, vault balance and expiry.',
    {},
    async () => {
      const status = await getMandateStatus();
      return text(status);
    }
  );

  // 2. Preflight dry-run check: check_action
  server.tool(
    'check_action',
    'Dry-run a call against the on-chain mandate without sending anything. Returns allowed=true, or the exact rule that would block it.',
    callShape,
    async (input) => {
      const c = buildCall(input);
      const res = await mandates.checkAction(mandateId, account.address, c.target, c.data, c.value);
      return text({ ...res, target: c.target, valueMON: c.valStr });
    }
  );

  // 3. Prompt 2 Primary Tool: agenttrust_execute
  server.tool(
    'agenttrust_execute',
    'Runs the call through the SDK guard(); returns the tx hash on success or a typed denial reason.',
    callShape,
    async (input) => {
      const c = buildCall(input);
      try {
        const { hash } = await mandates.execute(mandateId, c.target, c.data, c.value);
        return text({
          ok: true,
          transactionHash: hash,
          ...(chainId === 10143 ? { explorer: `${explorer}/tx/${hash}` } : {}),
        });
      } catch (e: any) {
        if (e instanceof MandateDeniedError) {
          return text({
            ok: false,
            blockedBy: e.reason,
            note: 'The human owner did not authorize this action. On-chain policy prevented execution.',
          });
        }
        return text({
          ok: false,
          error: e?.shortMessage || e?.message || String(e),
        });
      }
    }
  );

  // Alias: execute_action
  server.tool(
    'execute_action',
    'Execute a call through the AgentMandates contract. Disallowed calls are refused before any gas is spent.',
    callShape,
    async (input) => {
      const c = buildCall(input);
      try {
        const { hash } = await mandates.execute(mandateId, c.target, c.data, c.value);
        return text({
          ok: true,
          transactionHash: hash,
          ...(chainId === 10143 ? { explorer: `${explorer}/tx/${hash}` } : {}),
        });
      } catch (e: any) {
        if (e instanceof MandateDeniedError) {
          return text({
            ok: false,
            blockedBy: e.reason,
            note: 'The human owner did not authorize this. Do not retry with variations.',
          });
        }
        throw e;
      }
    }
  );

  // 4. Token payment tool: pay_token
  server.tool(
    'pay_token',
    "Pay an allowed payee in an ERC-20 token (e.g. a stablecoin) from the mandate's token vault, within the per-token caps the owner signed.",
    {
      token: z.string().describe('ERC-20 token address (see tokenBudgets in mandate_status)'),
      to: z.string().describe('Payee address; must be allowlisted in the mandate'),
      amount: z.string().describe('Amount in whole tokens as a decimal string, e.g. "2.5"'),
    },
    async ({ token, to, amount }) => {
      if (!isAddress(token) || !isAddress(to)) throw new Error('token and to must be addresses');
      const units = parseUnits(amount, (await tokenMeta(token)).decimals);
      try {
        const { hash } = await mandates.payToken(mandateId, token, to, units);
        return text({
          ok: true,
          transactionHash: hash,
          ...(chainId === 10143 ? { explorer: `${explorer}/tx/${hash}` } : {}),
        });
      } catch (e) {
        if (e instanceof MandateDeniedError) {
          return text({
            ok: false,
            blockedBy: e.reason,
            note: 'The human owner did not authorize this. Do not retry with variations.',
          });
        }
        throw e;
      }
    }
  );

  // 5. Prompt 2 Primary Tool: agenttrust_verify_receipt
  server.tool(
    'agenttrust_verify_receipt',
    'Verifies a transaction receipt against on-chain MandateManager / AgentMandates execution policies (matching npm run verify:tx).',
    {
      txHash: z.string().describe('Transaction hash to verify (0x...)'),
    },
    async ({ txHash }) => {
      if (!isHex(txHash) || txHash.length !== 66) {
        throw new Error(`Invalid txHash format: ${txHash}. Must be 66-character 0x-prefixed hex.`);
      }
      const result = await verifyReceipt(publicClient, contractAddress, txHash, {
        expectedChainId: chainId,
      });
      return text({
        verified: result.verified,
        status: result.status,
        blockNumber: result.blockNumber ? result.blockNumber.toString() : '0',
        gasUsed: result.gasUsed ? result.gasUsed.toString() : undefined,
        mandateId: result.mandateId !== undefined ? result.mandateId.toString() : undefined,
        target: result.target,
        selector: result.selector,
        valueMON: result.value !== undefined ? formatEther(result.value) : undefined,
        revertReason: result.revertReason,
        explorer: chainId === 10143 ? `${explorer}/tx/${txHash}` : undefined,
      });
    }
  );

  return server;
}

// Stdio Server Entrypoint
async function runCli() {
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

  const server = createAgentTrustMcpServer({
    contractAddress: CONTRACT,
    mandateId,
    account,
    publicClient,
    explorer: EXPLORER,
    chainId,
  });

  await server.connect(new StdioServerTransport());
  console.error(`agenttrust-mcp ready: mandate #${mandateId} on chain ${chainId} as ${account.address}`);
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('index.ts'));

if (isMain) {
  runCli().catch((err) => {
    console.error('agenttrust-mcp fatal error:', err);
    process.exit(1);
  });
}
