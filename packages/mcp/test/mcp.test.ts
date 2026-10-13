import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { privateKeyToAccount } from 'viem/accounts';
import {
  EstimateGasExecutionError,
  ExecutionRevertedError,
  RpcRequestError,
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  encodeFunctionData,
  keccak256,
  parseAbiItem,
  parseAbiParameters,
  parseEther,
  toFunctionSelector,
  type Address,
  type Hex,
} from 'viem';
import { AgentMandatesABI } from '@agenttrust/sdk';
import { createAgentTrustMcpServer, isMainModule } from '../src/index.js';

const DUMMY_AGENT_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
// AgentMandates v2 on Monad testnet (deployments.mandates.json); the tests never touch the chain.
const DUMMY_CONTRACT = '0xc911e902bf3b3f532bffc1a988e2d00969a1237c' as Address;
const TOKEN = '0x540564511d46e74c0ed48a6d63de8c79e61a860a' as Address;
const PAYEE = '0x7777777777777777777777777777777777777777' as Address;
const ALLOWED_TARGET = '0x0758fdc78e20f748fa89e2d53f84748697cb177f' as Address;
const ROGUE_TARGET = '0x9999999999999999999999999999999999999999' as Address;

test('AgentTrust MCP Server Suite', async (t) => {
  const account = privateKeyToAccount(DUMMY_AGENT_KEY);

  async function setupTestClient(
    mockReadContract: (args: any) => Promise<any>,
    mockWriteContract?: any,
    publicOverrides: Record<string, unknown> = {}
  ) {
    const mockPublicClient: any = {
      transport: { url: 'http://localhost:8545' },
      getChainId: async () => 10143,
      readContract: mockReadContract,
      waitForTransactionReceipt: async () => ({
        status: 'success',
        blockNumber: 42n,
        gasUsed: 21000n,
        logs: [],
      }),
      getTransactionReceipt: async () => ({
        status: 'success',
        blockNumber: 42n,
        gasUsed: 21000n,
        logs: [],
      }),
      ...publicOverrides,
    };

    const mockWalletClient: any = {
      account,
      chain: { id: 10143, name: 'Monad Testnet' },
      writeContract: mockWriteContract || (async () => '0x' + '22'.repeat(32)),
    };

    const server = createAgentTrustMcpServer({
      contractAddress: DUMMY_CONTRACT,
      mandateId: 1n,
      account,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
      chainId: 10143,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-mcp-client', version: '1.0.0' }, { capabilities: {} });
    await client.connect(clientTransport);

    return { client, server };
  }

  await t.test('lists all required Prompt 2 tools and aliases', async () => {
    const { client } = await setupTestClient(async () => []);
    const { tools } = await client.listTools();
    const names = tools.map((x) => x.name);

    assert.ok(names.includes('agenttrust_check_mandate'), 'has agenttrust_check_mandate');
    assert.ok(names.includes('agenttrust_execute'), 'has agenttrust_execute');
    assert.ok(names.includes('agenttrust_verify_receipt'), 'has agenttrust_verify_receipt');
    assert.ok(names.includes('mandate_status'), 'has mandate_status alias');
    assert.ok(names.includes('execute_action'), 'has execute_action alias');
    assert.ok(names.includes('check_action'), 'has check_action');
    assert.ok(names.includes('pay_token'), 'has pay_token');
  });

  await t.test('agenttrust_check_mandate returns active mandate limits and status', async () => {
    const { client } = await setupTestClient(async ({ functionName }) => {
      if (functionName === 'getMandate') {
        return {
          ownerKey: '0x' + 'aa'.repeat(32),
          agent: account.address,
          agentId: 1n,
          maxPerCall: parseEther('0.01'),
          budget: parseEther('0.05'),
          spent: parseEther('0.01'),
          balance: parseEther('0.04'),
          expiresAt: 1893456000n,
          epoch: 1n,
          revoked: false,
        };
      }
      if (functionName === 'getPermissions') {
        return [{ target: ALLOWED_TARGET, selector: '0xa6b206bf' }];
      }
      if (functionName === 'isActive') return true;
      if (functionName === 'getTokens') return [];
      return 0n;
    });

    const res = await client.callTool({
      name: 'agenttrust_check_mandate',
      arguments: {},
    });

    const parsed = JSON.parse((res.content[0] as any).text);
    assert.equal(parsed.mandateId, '1');
    assert.equal(parsed.active, true);
    assert.equal(parsed.revoked, false);
    assert.equal(parsed.limits.maxPerCallMON, '0.01');
    assert.equal(parsed.limits.remainingBudgetMON, '0.04');
    assert.equal(parsed.permissions.length, 1);
    assert.equal(parsed.permissions[0].target, ALLOWED_TARGET);
  });

  await t.test('denial path 1: over per-call limit -> blocked with typed reason ExceedsPerCallLimit', async () => {
    const { client } = await setupTestClient(async ({ functionName }) => {
      if (functionName === 'checkAction') {
        return [false, toFunctionSelector('ExceedsPerCallLimit()')];
      }
      return 0n;
    });

    const res = await client.callTool({
      name: 'agenttrust_execute',
      arguments: {
        target: ALLOWED_TARGET,
        selector: '0xa6b206bf',
        value: '1.5',
      },
    });

    const parsed = JSON.parse((res.content[0] as any).text);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.blockedBy, 'ExceedsPerCallLimit');
    assert.ok(parsed.note?.includes('On-chain policy prevented execution'));
  });

  await t.test('denial path 2: wrong / non-allowlisted target -> blocked with typed reason PermissionDenied', async () => {
    const { client } = await setupTestClient(async ({ functionName }) => {
      if (functionName === 'checkAction') {
        return [false, toFunctionSelector('PermissionDenied()')];
      }
      return 0n;
    });

    const res = await client.callTool({
      name: 'agenttrust_execute',
      arguments: {
        target: ROGUE_TARGET,
        selector: '0x00000000',
        value: '0.001',
      },
    });

    const parsed = JSON.parse((res.content[0] as any).text);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.blockedBy, 'PermissionDenied');
  });

  await t.test('denial path 3: revoked or expired mandate -> blocked with typed reason MandateInactive', async () => {
    const { client } = await setupTestClient(async ({ functionName }) => {
      if (functionName === 'checkAction') {
        return [false, toFunctionSelector('MandateInactive()')];
      }
      return 0n;
    });

    const res = await client.callTool({
      name: 'agenttrust_execute',
      arguments: {
        target: ALLOWED_TARGET,
        selector: '0xa6b206bf',
        value: '0.005',
      },
    });

    const parsed = JSON.parse((res.content[0] as any).text);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.blockedBy, 'MandateInactive');
  });

  await t.test('allowed execution succeeds and returns tx hash and explorer link', async () => {
    const mockTxHash = ('0x' + '33'.repeat(32)) as Hex;
    const { client } = await setupTestClient(
      async ({ functionName }) => {
        if (functionName === 'checkAction') {
          return [true, '0x00000000'];
        }
        return 0n;
      },
      async () => mockTxHash
    );

    const res = await client.callTool({
      name: 'agenttrust_execute',
      arguments: {
        target: ALLOWED_TARGET,
        selector: '0xa6b206bf',
        value: '0.005',
      },
    });

    const parsed = JSON.parse((res.content[0] as any).text);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.transactionHash, mockTxHash);
    assert.ok(parsed.explorer?.includes('testnet.monadexplorer.com/tx/0x3333'));
  });

  await t.test('agenttrust_verify_receipt returns verification summary matching npm run verify:tx', async () => {
    const sampleHash = ('0x' + '44'.repeat(32)) as Hex;
    const { client } = await setupTestClient(async () => 0n);

    const res = await client.callTool({
      name: 'agenttrust_verify_receipt',
      arguments: {
        txHash: sampleHash,
      },
    });

    const parsed = JSON.parse((res.content[0] as any).text);
    assert.equal(parsed.status, 'success');
    assert.equal(parsed.blockNumber, '42');
    assert.equal(parsed.gasUsed, '21000');
    assert.equal(parsed.verified, false);
  });

  const receiptWith = (logs: unknown[]) => ({
    waitForTransactionReceipt: async () => ({ status: 'success', blockNumber: 42n, gasUsed: 61000n, logs }),
  });
  const actionExecutedLog = (mandateId: bigint) => ({
    address: DUMMY_CONTRACT,
    topics: encodeEventTopics({
      abi: AgentMandatesABI,
      eventName: 'ActionExecuted',
      args: { mandateId, agent: account.address, target: ALLOWED_TARGET },
    }),
    data: encodeAbiParameters(parseAbiParameters('bytes4, uint256, uint256, bytes32'), [
      '0xa6b206bf',
      parseEther('0.005'),
      parseEther('0.015'),
      keccak256('0xa6b206bf'),
    ]),
  });
  const tokenReads = (decimals: () => Promise<number>) => async ({ functionName }: any) => {
    if (functionName === 'decimals') return decimals();
    if (functionName === 'symbol') return 'tUSDC';
    if (functionName === 'checkPayment') return [true, '0x00000000'];
    return 0n;
  };

  await t.test('verify_receipt verifies an AgentMandates v2 ActionExecuted receipt', async () => {
    const { client } = await setupTestClient(async () => 0n, undefined, receiptWith([actionExecutedLog(1n)]));
    const res = await client.callTool({ name: 'agenttrust_verify_receipt', arguments: { txHash: '0x' + '44'.repeat(32) } });
    const parsed = JSON.parse((res.content[0] as any).text);
    assert.equal(parsed.verified, true);
    assert.equal(parsed.kind, 'action');
    assert.equal(parsed.mandateId, '1');
    assert.equal(parsed.target.toLowerCase(), ALLOWED_TARGET);
    assert.equal(parsed.selector, '0xa6b206bf');
    assert.equal(parsed.valueMON, '0.005');
    assert.equal(parsed.spentMON, '0.015');
  });

  await t.test('verify_receipt verifies an AgentMandates v2 TokenPaid receipt with token units', async () => {
    const log = {
      address: DUMMY_CONTRACT,
      topics: encodeEventTopics({ abi: AgentMandatesABI, eventName: 'TokenPaid', args: { mandateId: 1n, token: TOKEN, to: PAYEE } }),
      data: encodeAbiParameters(parseAbiParameters('uint256, uint256'), [2_500_000n, 7_500_000n]),
    };
    const { client } = await setupTestClient(tokenReads(async () => 6), undefined, receiptWith([log]));
    const res = await client.callTool({ name: 'agenttrust_verify_receipt', arguments: { txHash: '0x' + '44'.repeat(32) } });
    const parsed = JSON.parse((res.content[0] as any).text);
    assert.equal(parsed.verified, true);
    assert.equal(parsed.kind, 'tokenPayment');
    assert.equal(parsed.symbol, 'tUSDC');
    assert.equal(parsed.amount, '2.5');
    assert.equal(parsed.amountBaseUnits, '2500000');
    assert.equal(parsed.tokenSpent, '7.5');
  });

  await t.test('verify_receipt rejects a receipt from another mandate', async () => {
    const { client } = await setupTestClient(async () => 0n, undefined, receiptWith([actionExecutedLog(7n)]));
    const res = await client.callTool({ name: 'agenttrust_verify_receipt', arguments: { txHash: '0x' + '44'.repeat(32) } });
    const parsed = JSON.parse((res.content[0] as any).text);
    assert.equal(parsed.verified, false);
    assert.match(parsed.revertReason, /Mandate #7, expected #1/);
  });

  await t.test('pay_token refuses to guess decimals and does not cache a failed read', async () => {
    let fail = true;
    const paid: bigint[] = [];
    const { client } = await setupTestClient(
      async (args) => {
        if (args.functionName === 'checkPayment') paid.push(args.args[4]);
        return tokenReads(async () => {
          if (fail) throw new Error('429 Too Many Requests');
          return 6;
        })(args);
      },
      async () => '0x' + '55'.repeat(32)
    );

    const refused = await client.callTool({ name: 'pay_token', arguments: { token: TOKEN, to: PAYEE, amount: '2.5' } });
    const r1 = JSON.parse((refused.content[0] as any).text);
    assert.equal(r1.ok, false);
    assert.match(r1.error, /decimals/);
    assert.equal(paid.length, 0, 'nothing checked or sent with guessed decimals');

    fail = false;
    const ok = await client.callTool({ name: 'pay_token', arguments: { token: TOKEN, to: PAYEE, amount: '2.5' } });
    assert.equal(JSON.parse((ok.content[0] as any).text).ok, true);
    assert.deepEqual(paid, [2_500_000n]);
  });

  const mandate = (overrides: Record<string, unknown> = {}) => ({
    ownerKey: '0x' + 'aa'.repeat(32),
    agent: account.address,
    agentId: 1n,
    maxPerCall: parseEther('0.01'),
    budget: parseEther('0.05'),
    spent: 0n,
    balance: parseEther('0.05'),
    expiresAt: 0n,
    epoch: 0n,
    revoked: false,
    ...overrides,
  });
  const statusOf = async (m: Record<string, unknown>, active: boolean, epoch = 0n, tokens: Address[] = [], decimals = async () => 6) => {
    const { client } = await setupTestClient(async ({ functionName }) => {
      if (functionName === 'getMandate') return m;
      if (functionName === 'isActive') return active;
      if (functionName === 'epochs') return epoch;
      if (functionName === 'getPermissions') return [];
      if (functionName === 'getTokens') return tokens;
      if (functionName === 'getTokenAllowance') return { maxPerCall: 10_000_000n, budget: 25_000_000n, spent: 0n, balance: 25_000_000n, enabled: true };
      if (functionName === 'decimals') return decimals();
      if (functionName === 'symbol') return 'tUSDC';
      return 0n;
    });
    const res = await client.callTool({ name: 'agenttrust_check_mandate', arguments: {} });
    return JSON.parse((res.content[0] as any).text);
  };

  await t.test('status: an expired mandate is reported as expired, not revoked', async () => {
    const s = await statusOf(mandate({ expiresAt: 1_600_000_000n }), false);
    assert.equal(s.active, false);
    assert.equal(s.status, 'expired');
    assert.equal(s.expired, true);
    assert.equal(s.revoked, false);
    assert.equal(s.revokedAll, false);
  });

  await t.test('status: revoked and revokeAll are told apart', async () => {
    const revoked = await statusOf(mandate({ revoked: true }), false);
    assert.equal(revoked.status, 'revoked');
    assert.equal(revoked.revoked, true);
    const all = await statusOf(mandate({ epoch: 0n }), false, 1n);
    assert.equal(all.status, 'revokedAll');
    assert.equal(all.revoked, false);
    assert.equal(all.revokedAll, true);
  });

  await t.test('status: a mandate id that does not exist says not found', async () => {
    const s = await statusOf(mandate({ ownerKey: '0x' + '00'.repeat(32), agent: '0x' + '00'.repeat(20) }), false);
    assert.equal(s.found, false);
    assert.equal(s.status, 'notFound');
    assert.match(s.error, /not found/);
    assert.equal(s.limits, undefined);
  });

  await t.test('status: unreadable token decimals are shown as unknown, in base units', async () => {
    const s = await statusOf(mandate(), true, 0n, [TOKEN], async () => {
      throw new Error('timeout');
    });
    assert.equal(s.tokenBudgets[0].decimals, 'unknown');
    assert.equal(s.tokenBudgets[0].maxPerCallBaseUnits, '10000000');
    assert.equal(s.tokenBudgets[0].maxPerCall, undefined);
  });

  async function checkedData(args: Record<string, unknown>) {
    let data: Hex | undefined;
    const { client } = await setupTestClient(async ({ functionName, args: a }) => {
      if (functionName === 'checkAction') {
        data = a[3];
        return [true, '0x00000000'];
      }
      return 0n;
    });
    const res = await client.callTool({ name: 'check_action', arguments: { target: ALLOWED_TARGET, ...args } });
    return { res, data };
  }

  await t.test('buildCall: selector with functionSignature + args sends the full encoded call', async () => {
    const sig = 'doSomething(uint256)';
    const expected = encodeFunctionData({ abi: [parseAbiItem(`function ${sig}`)], functionName: 'doSomething', args: [7n] });
    const { data } = await checkedData({ selector: toFunctionSelector(sig), functionSignature: sig, args: ['7'] });
    assert.equal(data, expected);
  });

  await t.test('buildCall: rejects ambiguous or malformed input instead of dropping it', async () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ selector: 'a9059cbb' }, /selector must be 4 bytes/],
      [{ selector: '0xa9059cbb', callData: '0x12345678' }, /does not match/],
      [{ selector: '0xa9059cbb', functionSignature: 'doSomething(uint256)', args: ['7'] }, /does not match/],
      [{ callData: '0x12345678', functionSignature: 'doSomething(uint256)' }, /not both/],
      [{ args: ['7'] }, /functionSignature/],
      [{ callData: '0x12', data: '0x34' }, /pass one of them/],
    ];
    for (const [args, message] of cases) {
      const { res, data } = await checkedData(args);
      assert.equal(res.isError, true, JSON.stringify(args));
      assert.match((res.content as any)[0].text, message);
      assert.equal(data, undefined, 'nothing was checked');
    }
  });

  await t.test('execute_action: a call the target would revert is not sent', async () => {
    let sent = 0;
    const revert = new EstimateGasExecutionError(
      new ExecutionRevertedError({
        cause: new RpcRequestError({
          body: {},
          url: 'http://localhost:8545',
          error: {
            code: 3,
            message: 'execution reverted',
            data: encodeErrorResult({ abi: AgentMandatesABI, errorName: 'CallFailed', args: ['0x'] }),
          },
        }),
        message: 'execution reverted',
      }),
      {} as any
    );
    const { client } = await setupTestClient(
      async ({ functionName }) => (functionName === 'checkAction' ? [true, '0x00000000'] : 0n),
      async () => {
        sent++;
        return '0x' + '66'.repeat(32);
      },
      { estimateGas: async () => { throw revert; } }
    );
    const res = await client.callTool({ name: 'execute_action', arguments: { target: ALLOWED_TARGET, selector: '0xa6b206bf' } });
    const parsed = JSON.parse((res.content[0] as any).text);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.failed, 'CallFailed');
    assert.equal(parsed.blockedBy, undefined);
    assert.equal(sent, 0);
  });
});

test('isMainModule follows the symlink npm creates for the bin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenttrust-mcp-'));
  try {
    const file = join(dir, 'index.js');
    writeFileSync(file, '');
    const link = join(dir, 'agenttrust-mcp');
    symlinkSync(file, link);
    const url = pathToFileURL(file).href;
    assert.equal(isMainModule(file, url), true);
    assert.equal(isMainModule(link, url), true, 'bin symlink counts as main');
    assert.equal(isMainModule(join(dir, 'other.js'), url), false, 'missing path');
    assert.equal(isMainModule(undefined, url), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
