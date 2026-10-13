import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { privateKeyToAccount } from 'viem/accounts';
import { parseEther, toFunctionSelector, type Address, type Hex } from 'viem';
import { createAgentTrustMcpServer } from '../src/index.js';

const DUMMY_AGENT_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const DUMMY_CONTRACT = '0x3550f9fc84640a9cfd7c51330615a1e05cb948be' as Address;
const ALLOWED_TARGET = '0x0758fdc78e20f748fa89e2d53f84748697cb177f' as Address;
const ROGUE_TARGET = '0x9999999999999999999999999999999999999999' as Address;

test('AgentTrust MCP Server Suite', async (t) => {
  const account = privateKeyToAccount(DUMMY_AGENT_KEY);

  async function setupTestClient(mockReadContract: (args: any) => Promise<any>, mockWriteContract?: any) {
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
  });
});
