import { describe, it, expect, vi } from 'vitest';
import {
  computeMandateHash,
  MANDATE_DOMAIN_TAG,
} from '../src/mandate.js';
import { verifyActionPreflight, verifyReceipt } from '../src/verify.js';
import type { AllowedTarget, Mandate } from '../src/types.js';
import { encodeEventTopics, encodeAbiParameters, parseAbiParameters } from 'viem';
import { MandateManagerABI } from '../src/abi.js';

describe('AgentTrust SDK', () => {
  const dummyContract = '0x1111111111111111111111111111111111111111' as const;
  const dummyOwner = '0x2222222222222222222222222222222222222222' as const;
  const dummyAgentAddress = '0x4444444444444444444444444444444444444444' as const;
  const dummyTarget = '0x3333333333333333333333333333333333333333' as const;

  describe('computeMandateHash', () => {
    it('produces deterministic canonical hash for identical parameters', () => {
      const targets: AllowedTarget[] = [{ target: dummyTarget, selector: '0x12345678' }];
      const params = {
        chainId: 10143, // Monad testnet
        mandateManagerAddress: dummyContract,
        owner: dummyOwner,
        agentAddress: dummyAgentAddress,
        agentId: 42n,
        targets,
        maxValuePerTx: 1000n,
        maxTotalValue: 5000n,
        expiresAt: 1800000000n,
        nonce: 0n,
      };

      const hash1 = computeMandateHash(params);
      const hash2 = computeMandateHash(params);

      expect(hash1).toBe(hash2);
      expect(hash1.startsWith('0x')).toBe(true);
      expect(hash1.length).toBe(66);
    });

    it('changes hash if any parameter is altered (anti-tamper test)', () => {
      const targets: AllowedTarget[] = [{ target: dummyTarget, selector: '0x12345678' }];
      const base = {
        chainId: 10143,
        mandateManagerAddress: dummyContract,
        owner: dummyOwner,
        agentAddress: dummyAgentAddress,
        agentId: 42n,
        targets,
        maxValuePerTx: 1000n,
        maxTotalValue: 5000n,
        expiresAt: 1800000000n,
        nonce: 0n,
      };

      const baseHash = computeMandateHash(base);
      const alteredAgentHash = computeMandateHash({ ...base, agentId: 43n });
      const alteredAgentAddrHash = computeMandateHash({
        ...base,
        agentAddress: '0x5555555555555555555555555555555555555555',
      });
      const alteredLimitHash = computeMandateHash({ ...base, maxValuePerTx: 1001n });
      const alteredNonceHash = computeMandateHash({ ...base, nonce: 1n });
      const alteredChainHash = computeMandateHash({ ...base, chainId: 1 });

      expect(alteredAgentHash).not.toBe(baseHash);
      expect(alteredAgentAddrHash).not.toBe(baseHash);
      expect(alteredLimitHash).not.toBe(baseHash);
      expect(alteredNonceHash).not.toBe(baseHash);
      expect(alteredChainHash).not.toBe(baseHash);
    });
  });

  describe('verifyActionPreflight', () => {
    const mockMandate: Mandate = {
      owner: dummyOwner,
      agentAddress: dummyAgentAddress,
      agentId: 77n,
      maxValuePerTx: 500n,
      maxTotalValue: 2000n,
      spentValue: 200n,
      expiresAt: 2000000000n,
      nonce: 0n,
      revoked: false,
    };

    const mockTargets: AllowedTarget[] = [
      { target: dummyTarget, selector: '0xa9059cbb' }, // transfer selector
    ];

    function createMockPublicClient(overrides?: Partial<Mandate>) {
      const currentMandate = { ...mockMandate, ...overrides };
      return {
        readContract: vi.fn(async ({ functionName }: any) => {
          if (functionName === 'getMandate') return currentMandate;
          if (functionName === 'getAllowedTargets') return mockTargets;
          if (functionName === 'mandateBalances') return 10000n;
          if (functionName === 'isActive')
            return !currentMandate.revoked && currentMandate.owner !== '0x0000000000000000000000000000000000000000';
          return null;
        }),
        getBlock: vi.fn(async () => ({ timestamp: 1700000000n })),
      } as any;
    }

    it('validates legitimate allowed action', async () => {
      const client = createMockPublicClient();
      const res = await verifyActionPreflight(client, dummyContract, 1n, {
        agentId: 77n,
        target: dummyTarget,
        selector: '0xa9059cbb',
        value: 100n,
      });

      expect(res.valid).toBe(true);
      expect(res.remainingBudget).toBe(1800n);
      expect(res.mandateBalance).toBe(10000n);
    });

    it('rejects action if mandate has been revoked', async () => {
      const client = createMockPublicClient({ revoked: true });
      const res = await verifyActionPreflight(client, dummyContract, 1n, {
        agentId: 77n,
        target: dummyTarget,
        selector: '0xa9059cbb',
        value: 100n,
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('revoked');
    });

    it('rejects action if mandate has expired', async () => {
      const client = createMockPublicClient({ expiresAt: 1600000000n });
      const res = await verifyActionPreflight(client, dummyContract, 1n, {
        agentId: 77n,
        target: dummyTarget,
        selector: '0xa9059cbb',
        value: 100n,
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('expired');
    });

    it('rejects action if agent ID mismatch', async () => {
      const client = createMockPublicClient();
      const res = await verifyActionPreflight(client, dummyContract, 1n, {
        agentId: 999n, // wrong agent
        target: dummyTarget,
        selector: '0xa9059cbb',
        value: 100n,
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Agent ID mismatch');
    });

    it('rejects action if target is not allowed', async () => {
      const client = createMockPublicClient();
      const res = await verifyActionPreflight(client, dummyContract, 1n, {
        agentId: 77n,
        target: '0x9999999999999999999999999999999999999999', // unauthorized target
        selector: '0xa9059cbb',
        value: 100n,
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('not allowlisted');
    });

    it('rejects action exceeding per-tx spending limit', async () => {
      const client = createMockPublicClient();
      const res = await verifyActionPreflight(client, dummyContract, 1n, {
        agentId: 77n,
        target: dummyTarget,
        selector: '0xa9059cbb',
        value: 501n, // limit is 500
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('exceeds per-action cap');
    });

    it('rejects action exceeding cumulative total spending limit', async () => {
      const client = createMockPublicClient({ spentValue: 1800n, maxTotalValue: 2000n });
      const res = await verifyActionPreflight(client, dummyContract, 1n, {
        agentId: 77n,
        target: dummyTarget,
        selector: '0xa9059cbb',
        value: 250n, // 1800 + 250 = 2050 > 2000
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('exceeds remaining cumulative budget');
    });
  });

  describe('verifyReceipt', () => {
    it('returns reverted status when receipt status is reverted', async () => {
      const mockPublicClient = {
        waitForTransactionReceipt: vi.fn(async () => ({
          status: 'reverted',
          blockNumber: 12345n,
          logs: [],
        })),
      } as any;

      const res = await verifyReceipt(
        mockPublicClient,
        dummyContract,
        '0xabc1230000000000000000000000000000000000000000000000000000000000'
      );

      expect(res.verified).toBe(false);
      expect(res.status).toBe('reverted');
      expect(res.revertReason).toContain('reverted');
    });

    it('rejects logs emitted by an unrelated contract (false positive defense)', async () => {
      const topics = encodeEventTopics({
        abi: MandateManagerABI,
        eventName: 'ActionExecuted',
        args: {
          mandateId: 1n,
          target: dummyTarget,
        },
      });

      const data = encodeAbiParameters(
        parseAbiParameters('bytes4 selector, uint256 value, bytes returnData'),
        ['0xa9059cbb', 100n, '0x']
      );

      const unrelatedAddress = '0x9999999999999999999999999999999999999999';
      const mockPublicClient = {
        waitForTransactionReceipt: vi.fn(async () => ({
          status: 'success',
          blockNumber: 12345n,
          logs: [
            {
              address: unrelatedAddress, // Not the MandateManager contract!
              topics,
              data,
            },
          ],
        })),
      } as any;

      const res = await verifyReceipt(
        mockPublicClient,
        dummyContract,
        '0xabc1230000000000000000000000000000000000000000000000000000000000'
      );

      expect(res.verified).toBe(false);
      expect(res.revertReason).toContain('no ActionExecuted event was emitted by MandateManager');
    });

    it('verifies valid ActionExecuted event from correct contract', async () => {
      const topics = encodeEventTopics({
        abi: MandateManagerABI,
        eventName: 'ActionExecuted',
        args: {
          mandateId: 1n,
          target: dummyTarget,
        },
      });

      const data = encodeAbiParameters(
        parseAbiParameters('bytes4 selector, uint256 value, bytes returnData'),
        ['0xa9059cbb', 100n, '0x']
      );

      const mockPublicClient = {
        waitForTransactionReceipt: vi.fn(async () => ({
          status: 'success',
          blockNumber: 54321n,
          logs: [
            {
              address: dummyContract,
              topics,
              data,
            },
          ],
        })),
      } as any;

      const res = await verifyReceipt(
        mockPublicClient,
        dummyContract,
        '0xabc1230000000000000000000000000000000000000000000000000000000000',
        {
          expectedMandateId: 1n,
          expectedTarget: dummyTarget,
          expectedSelector: '0xa9059cbb',
        }
      );

      expect(res.verified).toBe(true);
      expect(res.mandateId).toBe(1n);
      expect(res.target).toBe(dummyTarget);
      expect(res.selector).toBe('0xa9059cbb');
      expect(res.value).toBe(100n);
    });

    it('rejects when expected mandate ID mismatches', async () => {
      const topics = encodeEventTopics({
        abi: MandateManagerABI,
        eventName: 'ActionExecuted',
        args: {
          mandateId: 1n,
          target: dummyTarget,
        },
      });

      const data = encodeAbiParameters(
        parseAbiParameters('bytes4 selector, uint256 value, bytes returnData'),
        ['0xa9059cbb', 100n, '0x']
      );

      const mockPublicClient = {
        waitForTransactionReceipt: vi.fn(async () => ({
          status: 'success',
          blockNumber: 54321n,
          logs: [
            {
              address: dummyContract,
              topics,
              data,
            },
          ],
        })),
      } as any;

      const res = await verifyReceipt(
        mockPublicClient,
        dummyContract,
        '0xabc1230000000000000000000000000000000000000000000000000000000000',
        {
          expectedMandateId: 99n, // wrong expected ID
        }
      );

      expect(res.verified).toBe(false);
      expect(res.revertReason).toContain('Receipt emitted for Mandate #1, expected #99');
    });
  });
});
