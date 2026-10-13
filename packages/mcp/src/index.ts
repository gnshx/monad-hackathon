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
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
import {
  AgentMandates,
  MandateCallFailedError,
  MandateDeniedError,
  verifyMandatesReceipt,
  verifyReceipt,
} from '@agenttrust/sdk';

const ERC20_META_ABI = [
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
] as const;

const CALL_FAILED_NOTE =
  'The mandate allows this call, but the target would revert it, so nothing was sent and no gas was spent. Check the arguments.';

/** The tool result for a call the mandate allowed but the target would reject. */
function callFailed(e: MandateCallFailedError) {
  return {
    ok: false,
    failed: e.reason,
    ...(e.targetReason ? { targetReason: e.targetReason } : {}),
    ...(e.returnData !== '0x' ? { returnData: e.returnData } : {}),
    note: CALL_FAILED_NOTE,
  };
}

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

  // Token decimals and symbol. decimals() must come from the chain: if it can't be read this
  // throws (pay_token then refuses) rather than guessing. Only complete reads are cached, so a
  // transient RPC failure is retried on the next call instead of sticking for the process's life.
  const metaCache = new Map<string, { symbol: string; decimals: number }>();
  async function tokenMeta(token: Address) {
    const hit = metaCache.get(token.toLowerCase());
    if (hit) return hit;
    const [decimals, symbol] = await Promise.all([
      publicClient.readContract({ address: token, abi: ERC20_META_ABI, functionName: 'decimals' }).catch((e: any) => {
        throw new Error(`Could not read decimals() of token ${token}: ${e?.shortMessage ?? e?.message ?? e}`);
      }),
      publicClient.readContract({ address: token, abi: ERC20_META_ABI, functionName: 'symbol' }).catch(() => undefined),
    ]);
    const meta = { symbol: symbol ?? 'TOKEN', decimals: Number(decimals) };
    if (symbol !== undefined) metaCache.set(token.toLowerCase(), meta);
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
    if (BigInt(m.ownerKey) === 0n) {
      return {
        mandateId: id.toString(),
        found: false,
        active: false,
        status: 'notFound',
        error: `Mandate #${id} not found on AgentMandates at ${contractAddress}`,
      };
    }
    // isActive() is false when the mandate was revoked, ended by the owner's revokeAll(), or has
    // expired. Report which, instead of calling every inactive mandate "revoked".
    const revokedAll = !active && (await mandates.epoch(m.ownerKey)) !== m.epoch;
    const expired =
      !active &&
      m.expiresAt !== 0n &&
      (BigInt(Math.floor(Date.now() / 1000)) > m.expiresAt || (!m.revoked && !revokedAll));
    const status = active ? 'active' : m.revoked ? 'revoked' : revokedAll ? 'revokedAll' : expired ? 'expired' : 'inactive';
    const tokenBudgets = await Promise.all(
      tokens.map(async (token) => {
        const [ta, meta] = await Promise.all([mandates.getTokenAllowance(id, token), tokenMeta(token).catch(() => undefined)]);
        if (!meta) {
          return {
            token,
            decimals: 'unknown',
            maxPerCallBaseUnits: ta.maxPerCall.toString(),
            remainingBudgetBaseUnits: (ta.budget - ta.spent).toString(),
            vaultBalanceBaseUnits: ta.balance.toString(),
            note: "Couldn't read this token's decimals(); amounts are in base units and pay_token will refuse it until they can be read.",
          };
        }
        return {
          token,
          symbol: meta.symbol,
          decimals: meta.decimals,
          maxPerCall: formatUnits(ta.maxPerCall, meta.decimals),
          remainingBudget: formatUnits(ta.budget - ta.spent, meta.decimals),
          vaultBalance: formatUnits(ta.balance, meta.decimals),
        };
      })
    );
    return {
      mandateId: id.toString(),
      found: true,
      active,
      status,
      revoked: m.revoked,
      revokedAll,
      expired,
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
    selector: z
      .string()
      .optional()
      .describe('4-byte function selector (e.g. 0xa6b206bf). Alone, it calls a function with no arguments; with callData or functionSignature it must match them.'),
    callData: z.string().optional().describe('Raw calldata hex (0x...), instead of functionSignature + args'),
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
    // Blank strings count as absent; conflicting fields are rejected, never silently dropped.
    const given = (x?: string) => (x === undefined || x.trim() === '' ? undefined : x.trim());
    const selector = given(input.selector);
    const callData = given(input.callData);
    const rawData = given(input.data);
    const signature = given(input.functionSignature);

    if (selector !== undefined && !/^0x[0-9a-fA-F]{8}$/.test(selector)) {
      throw new Error(`selector must be 4 bytes of 0x-prefixed hex, e.g. 0xa9059cbb (got "${selector}")`);
    }
    if (callData !== undefined && rawData !== undefined && callData.toLowerCase() !== rawData.toLowerCase()) {
      throw new Error('callData and data are the same field: pass one of them');
    }
    const raw = callData ?? rawData;
    if (raw !== undefined && !isHex(raw)) throw new Error('callData must be 0x-prefixed hex');
    if (raw !== undefined && signature !== undefined) {
      throw new Error('Pass either raw callData or functionSignature + args, not both');
    }
    if (input.args?.length && signature === undefined) {
      throw new Error('args need a functionSignature to be encoded');
    }

    let data: Hex = '0x';
    if (raw !== undefined) {
      data = raw as Hex;
    } else if (signature !== undefined) {
      const item = parseAbiItem(`function ${signature}`) as any;
      data = encodeFunctionData({ abi: [item], functionName: item.name, args: input.args ?? [] });
    } else if (selector !== undefined) {
      data = selector.toLowerCase() as Hex;
    }
    if (selector !== undefined && data.slice(0, 10).toLowerCase() !== selector.toLowerCase()) {
      throw new Error(`selector ${selector} does not match the calldata, which starts with ${data.slice(0, 10)}`);
    }

    const value = given(input.value);
    const valueMON = given(input.valueMON);
    if (value !== undefined && valueMON !== undefined && value !== valueMON) {
      throw new Error('value and valueMON are the same field: pass one of them');
    }
    const valStr = value ?? valueMON ?? '0';
    return { target: input.target as Address, data, value: parseEther(valStr), valStr };
  }

  // 1. Prompt 2 Primary Tool: agenttrust_check_mandate
  server.tool(
    'agenttrust_check_mandate',
    "Returns the mandate's limits, expiry and status read from chain: active, revoked, revokedAll (the owner revoked all their mandates), expired, or notFound.",
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
        if (e instanceof MandateCallFailedError) return text(callFailed(e));
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
        if (e instanceof MandateCallFailedError) return text(callFailed(e));
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
      let decimals: number;
      try {
        decimals = (await tokenMeta(token)).decimals;
      } catch (e: any) {
        return text({ ok: false, error: `${e?.message ?? e}. Refusing to pay with guessed decimals; nothing was sent.` });
      }
      const units = parseUnits(amount, decimals);
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
        if (e instanceof MandateCallFailedError) return text(callFailed(e));
        throw e;
      }
    }
  );

  // 5. Prompt 2 Primary Tool: agenttrust_verify_receipt
  server.tool(
    'agenttrust_verify_receipt',
    'Verifies a transaction against the AgentMandates contract: it succeeded and emitted ActionExecuted (execute) or TokenPaid (pay_token) for the mandate.',
    {
      txHash: z.string().describe('Transaction hash to verify (0x...)'),
      mandateId: z
        .string()
        .optional()
        .describe('Mandate the receipt must belong to (defaults to the configured AGENTTRUST_MANDATE_ID)'),
    },
    async ({ txHash, mandateId: customId }) => {
      if (!isHex(txHash) || txHash.length !== 66) {
        throw new Error(`Invalid txHash format: ${txHash}. Must be 66-character 0x-prefixed hex.`);
      }
      const expectedMandateId = customId ? BigInt(customId) : mandateId;
      const explorerLink = chainId === 10143 ? `${explorer}/tx/${txHash}` : undefined;
      const r = await verifyMandatesReceipt(publicClient, contractAddress, txHash, {
        expectedChainId: chainId,
        expectedMandateId,
      });
      const common = {
        verified: r.verified,
        status: r.status,
        blockNumber: r.blockNumber ? r.blockNumber.toString() : '0',
        gasUsed: r.gasUsed !== undefined ? r.gasUsed.toString() : undefined,
        mandateId: r.mandateId !== undefined ? r.mandateId.toString() : undefined,
      };

      if (r.kind === 'tokenPayment') {
        const meta = await tokenMeta(r.token!).catch(() => undefined);
        return text({
          ...common,
          kind: r.kind,
          token: r.token,
          symbol: meta?.symbol,
          to: r.to,
          amount: meta ? formatUnits(r.amount!, meta.decimals) : undefined,
          amountBaseUnits: r.amount!.toString(),
          tokenSpent: meta ? formatUnits(r.spent!, meta.decimals) : undefined,
          revertReason: r.revertReason,
          explorer: explorerLink,
        });
      }
      if (r.kind === 'action') {
        return text({
          ...common,
          kind: r.kind,
          agent: r.agent,
          target: r.target,
          selector: r.selector,
          valueMON: formatEther(r.value!),
          spentMON: formatEther(r.spent!),
          callDataHash: r.callDataHash,
          revertReason: r.revertReason,
          explorer: explorerLink,
        });
      }

      // No v2 event: if the server points at a legacy v1 MandateManager, its receipts still verify.
      if (r.status === 'success' && r.mandateId === undefined) {
        const v1 = await verifyReceipt(publicClient, contractAddress, txHash).catch(() => undefined);
        if (v1?.verified) {
          return text({
            ...common,
            verified: true,
            contract: 'MandateManager (v1)',
            mandateId: v1.mandateId?.toString(),
            target: v1.target,
            selector: v1.selector,
            valueMON: v1.value !== undefined ? formatEther(v1.value) : undefined,
            explorer: explorerLink,
          });
        }
      }
      return text({ ...common, revertReason: r.revertReason, explorer: explorerLink });
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

/**
 * Whether `moduleUrl` is the script node was started with. Compares real paths, because a bin
 * installed by npm (npx, `npm i -g`, `npm link`) is a symlink and node leaves argv[1] as the link.
 */
export function isMainModule(argv1: string | undefined, moduleUrl: string): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (typeof process !== 'undefined' && isMainModule(process.argv[1], import.meta.url)) {
  runCli().catch((err) => {
    console.error('agenttrust-mcp fatal error:', err);
    process.exit(1);
  });
}
