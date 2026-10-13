import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  checkJudgeStatus,
  decodeCustomError,
  explainRelayerError,
  judgeRunCost,
  JUDGE_RUN_GAS,
  signDigestP256,
  TARGET_SELECTOR,
} from '../judge-mode-runner.js';
import { parseEther, type Address, type Hex } from 'viem';
import crypto from 'crypto';

const MM_ADDRESS = '0x3550f9fc84640a9cfd7c51330615a1e05cb948be' as Address;
const TARGET_ADDRESS = '0x0758fdc78e20f748fa89e2d53f84748697cb177f' as Address;
const DUMMY_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;

test('Judge Mode Runner & Status Tests', async (t) => {
  await t.test('honesty: checkJudgeStatus fails when chain ID is not 10143', async () => {
    const mockClient: any = {
      getChainId: async () => 1, // Mainnet instead of Monad 10143
    };

    const result = await checkJudgeStatus(mockClient, MM_ADDRESS, TARGET_ADDRESS, DUMMY_KEY);
    assert.equal(result.deployed, false);
    assert.equal(result.chainId, 1);
    assert.ok(result.message?.includes('expected 10143'));
  });

  await t.test('honesty: checkJudgeStatus fails when bytecode is empty (Not deployed on Monad testnet)', async () => {
    const mockClient: any = {
      getChainId: async () => 10143,
      getBytecode: async ({ address }: { address: Address }) => {
        if (address === MM_ADDRESS) return '0x'; // Empty bytecode
        return '0x60806040';
      },
    };

    const result = await checkJudgeStatus(mockClient, MM_ADDRESS, TARGET_ADDRESS, DUMMY_KEY);
    assert.equal(result.deployed, false);
    assert.equal(result.message, 'Not deployed on Monad testnet');
  });

  await t.test('honesty: checkJudgeStatus flags low funds when relayer balance < 0.005 MON', async () => {
    const mockClient: any = {
      getChainId: async () => 10143,
      getBytecode: async () => '0x60806040',
      getBalance: async () => parseEther('0.001'), // 0.001 MON < 0.005 MON
    };

    const result = await checkJudgeStatus(mockClient, MM_ADDRESS, TARGET_ADDRESS, DUMMY_KEY);
    assert.equal(result.deployed, true);
    assert.equal(result.lowFunds, true);
    assert.equal(result.message, 'Relayer low on funds');
  });

  await t.test('checkJudgeStatus passes with full readiness when deployed and funded on chain 10143', async () => {
    const mockClient: any = {
      getChainId: async () => 10143,
      getBytecode: async () => '0x60806040',
      getBalance: async () => parseEther('1.5'),
    };

    const result = await checkJudgeStatus(mockClient, MM_ADDRESS, TARGET_ADDRESS, DUMMY_KEY);
    assert.equal(result.deployed, true);
    assert.equal(result.lowFunds, false);
    assert.equal(result.chainId, 10143);
    assert.ok(result.relayerAddress);
    assert.equal(result.relayerBalance, '1.5 MON');
  });

  await t.test('decodeCustomError maps custom errors accurately', () => {
    assert.equal(decodeCustomError(new Error('execution reverted: ExceedsPerTxLimit')), 'ExceedsPerTxLimit()');
    assert.equal(decodeCustomError(new Error('execution reverted: TargetNotAllowed')), 'TargetNotAllowed()');
    assert.equal(decodeCustomError(new Error('execution reverted: MandateIsRevoked')), 'MandateIsRevoked()');
    assert.equal(decodeCustomError(new Error('execution reverted: UnauthorizedAgent')), 'UnauthorizedAgent()');
  });

  await t.test('signDigestP256 generates normalized low-S signatures compliant with RIP-7212', () => {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const signer = crypto.createSign('SHA256');
    signer.update('test-digest');
    const derSig = signer.sign(privateKey);

    const sig = signDigestP256(derSig);
    assert.ok(sig.r.startsWith('0x'));
    assert.ok(sig.s.startsWith('0x'));
    assert.equal(sig.r.length, 66); // 32 bytes hex + '0x'
    assert.equal(sig.s.length, 66);

    const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
    const P256_N_DIV_2 = P256_N / 2n;
    const sVal = BigInt(sig.s);
    assert.ok(sVal <= P256_N_DIV_2, 's must be normalized to lower half of curve order');
  });

  await t.test('verifies fixed target selector is doSomething(uint256)', () => {
    // toFunctionSelector('doSomething(uint256)') === '0xa6b206bf'
    assert.equal(TARGET_SELECTOR, '0xa6b206bf');
  });

  await t.test('gas-aware low funds: a balance that covers 0.005 MON but not a run at the live gas price is low', async () => {
    const mockClient: any = {
      getChainId: async () => 10143,
      getBytecode: async () => '0x60806040',
      getBalance: async () => parseEther('0.0128'),
      getGasPrice: async () => 52_000_000_000n, // 52 gwei
    };
    const cost = await judgeRunCost(mockClient);
    assert.equal(cost, (52_000_000_000n * JUDGE_RUN_GAS * 3n) / 2n + parseEther('0.0003'));
    const result = await checkJudgeStatus(mockClient, MM_ADDRESS, TARGET_ADDRESS, DUMMY_KEY);
    assert.equal(result.lowFunds, true);
    assert.ok(result.requiredBalance?.endsWith(' MON'));
  });

  await t.test('explainRelayerError turns an underfunded sendRawTransaction into a funding hint', () => {
    const relayer = '0x5B71688146B44e9eEcCbca1847F43D9420909B0B' as Address;
    const err = { message: 'Missing or invalid parameters. URL: https://testnet-rpc.monad.xyz Request body: {"method":"eth_sendRawTransaction"}' };
    assert.match(explainRelayerError(err, relayer), /ran out of testnet MON/);
    assert.match(explainRelayerError({ shortMessage: 'insufficient funds for gas * price + value' }), /ran out of testnet MON/);
    assert.equal(explainRelayerError(new Error('boom\nstack')), 'boom');
  });
});

test('Judge Mode v2 (AgentMandates) helpers', async (t) => {
  const { judgeV2RunCost, identityHolds, JUDGE_V2_RUN_GAS, VAULT_FUNDING, ALLOWED_VALUE, MAX_PER_CALL, OVERSPEND_VALUE } =
    await import('../judge-v2-runner.js');
  const AGENT = '0x5B71688146B44e9eEcCbca1847F43D9420909B0B' as Address;
  const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as Address;

  await t.test('run cost scales with the live gas price (Monad bills the gas limit)', async () => {
    const cost = await judgeV2RunCost({ getGasPrice: async () => 102_000_000_000n } as any);
    assert.equal(cost, (102_000_000_000n * JUDGE_V2_RUN_GAS * 6n) / 5n + VAULT_FUNDING);
    assert.ok(cost > parseEther('0.1'), 'a run at ~100 gwei needs more than 0.1 MON');
  });

  await t.test('run cost falls back to the floor when the RPC has no gas price', async () => {
    const cost = await judgeV2RunCost({ getGasPrice: async () => { throw new Error('rpc down'); } } as any);
    assert.equal(cost, parseEther('0.005'));
  });

  await t.test('scenario amounts: the allowed call spends exactly the vault, the overspend breaks the per-call cap', () => {
    assert.equal(VAULT_FUNDING, ALLOWED_VALUE);
    assert.ok(ALLOWED_VALUE <= MAX_PER_CALL);
    assert.ok(OVERSPEND_VALUE > MAX_PER_CALL);
  });

  await t.test('identityHolds mirrors the contract: wallet first, then owner, fails closed', async () => {
    const client = (wallet: string | Error, owner: string | Error) =>
      ({
        readContract: async ({ functionName }: any) => {
          const v = functionName === 'getAgentWallet' ? wallet : owner;
          if (v instanceof Error) throw v;
          return v;
        },
      }) as any;
    const zero = '0x0000000000000000000000000000000000000000';
    assert.equal(await identityHolds(client(AGENT.toLowerCase(), zero), REGISTRY, AGENT, 1n), true);
    assert.equal(await identityHolds(client(zero, AGENT), REGISTRY, AGENT, 1n), true);
    assert.equal(await identityHolds(client(zero, new Error('ERC721NonexistentToken')), REGISTRY, AGENT, 1n), false);
    assert.equal(await identityHolds(client(new Error('x'), zero), REGISTRY, AGENT, 1n), false);
    assert.equal(await identityHolds(client(new Error('x'), new Error('y')), zero as Address, AGENT, 1n), true);
  });
});
