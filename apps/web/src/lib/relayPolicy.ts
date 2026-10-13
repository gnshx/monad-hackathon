import { isHex, slice, toFunctionSelector, type Hex } from 'viem';
import { AgentMandatesABI } from '@agenttrust/sdk';

export const selectorOf = (name: string): Hex =>
  toFunctionSelector(AgentMandatesABI.find((x) => x.type === 'function' && x.name === name) as any);

export const CREATE_SELECTOR = selectorOf('createMandate');
export const REVOKE_SELECTOR = selectorOf('revoke');
export const REVOKE_ALL_SELECTOR = selectorOf('revokeAll');
export const WITHDRAW_SELECTOR = selectorOf('withdraw');
export const WITHDRAW_TOKEN_SELECTOR = selectorOf('withdrawToken');

export const RELAYABLE_SELECTORS = new Set<Hex>([
  CREATE_SELECTOR,
  REVOKE_SELECTOR,
  REVOKE_ALL_SELECTOR,
  WITHDRAW_SELECTOR,
  WITHDRAW_TOKEN_SELECTOR,
]);

export interface RelayPolicyConfig {
  maxRequestsPerMinutePerIp?: number;
  maxSponsorPerTxWei?: bigint;
  maxDailySponsorPerIpWei?: bigint;
  maxDailyGlobalSponsorWei?: bigint;
}

export const DEFAULT_RELAY_CONFIG: RelayPolicyConfig = {
  maxRequestsPerMinutePerIp: 10,
  maxSponsorPerTxWei: 50_000_000_000_000_000n, // 0.05 MON
  maxDailySponsorPerIpWei: 100_000_000_000_000_000n, // 0.10 MON
  maxDailyGlobalSponsorWei: 500_000_000_000_000_000n, // 0.50 MON
};

export class RelayPolicyTracker {
  private requestsByIp = new Map<string, number[]>();
  private spendByIp = new Map<string, { amount: bigint; timestamp: number }[]>();
  private globalSpend: { amount: bigint; timestamp: number }[] = [];

  constructor(private config: RelayPolicyConfig = DEFAULT_RELAY_CONFIG) {}

  checkRateLimit(ip: string, now = Date.now()): { allowed: boolean; retryAfterSeconds?: number } {
    const limit = this.config.maxRequestsPerMinutePerIp ?? 10;
    const history = (this.requestsByIp.get(ip) || []).filter((t) => now - t < 60_000);
    if (history.length >= limit) {
      const oldest = history[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((60_000 - (now - oldest)) / 1000));
      return { allowed: false, retryAfterSeconds };
    }
    this.requestsByIp.set(ip, [...history, now]);
    return { allowed: true };
  }

  checkSponsorCap(ip: string, requestedWei: bigint, now = Date.now()): { allowed: boolean; reason?: string } {
    if (requestedWei === 0n) return { allowed: true };

    const maxPerTx = this.config.maxSponsorPerTxWei ?? 50_000_000_000_000_000n;
    if (requestedWei > maxPerTx) {
      return { allowed: false, reason: `Sponsored funding exceeds per-transaction cap (${maxPerTx} wei)` };
    }

    const oneDay = 24 * 60 * 60 * 1000;
    const maxDailyPerIp = this.config.maxDailySponsorPerIpWei ?? 100_000_000_000_000_000n;
    const ipHistory = (this.spendByIp.get(ip) || []).filter((s) => now - s.timestamp < oneDay);
    const ipTotal = ipHistory.reduce((acc, s) => acc + s.amount, 0n);

    if (ipTotal + requestedWei > maxDailyPerIp) {
      return { allowed: false, reason: `Daily sponsored funding cap reached for this IP (${maxDailyPerIp} wei/day)` };
    }

    const maxDailyGlobal = this.config.maxDailyGlobalSponsorWei ?? 500_000_000_000_000_000n;
    const globalHistory = this.globalSpend.filter((s) => now - s.timestamp < oneDay);
    const globalTotal = globalHistory.reduce((acc, s) => acc + s.amount, 0n);

    if (globalTotal + requestedWei > maxDailyGlobal) {
      return { allowed: false, reason: 'Global daily sponsored relayer budget reached' };
    }

    return { allowed: true };
  }

  recordSpend(ip: string, amount: bigint, now = Date.now()): void {
    if (amount <= 0n) return;
    const oneDay = 24 * 60 * 60 * 1000;
    const ipHistory = (this.spendByIp.get(ip) || []).filter((s) => now - s.timestamp < oneDay);
    this.spendByIp.set(ip, [...ipHistory, { amount, timestamp: now }]);

    const globalHistory = this.globalSpend.filter((s) => now - s.timestamp < oneDay);
    this.globalSpend = [...globalHistory, { amount, timestamp: now }];
  }

  reset(): void {
    this.requestsByIp.clear( );
    this.spendByIp.clear();
    this.globalSpend = [];
  }
}

export function validateRelayCalldata(data: unknown): { valid: boolean; selector?: Hex; isCreate?: boolean; error?: string } {
  if (typeof data !== 'string' || !isHex(data) || data.length < 10) {
    return { valid: false, error: 'Missing or invalid hex calldata' };
  }
  const selector = slice(data, 0, 4);
  if (!RELAYABLE_SELECTORS.has(selector)) {
    return { valid: false, error: 'Only authorized owner actions (create, revoke, withdraw) can be relayed' };
  }
  return { valid: true, selector, isCreate: selector === CREATE_SELECTOR };
}
