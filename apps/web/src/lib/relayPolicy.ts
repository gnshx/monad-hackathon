import { formatEther, isHex, slice, toFunctionSelector, type Hex } from 'viem';
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

/** Vault sponsorship per grant when RELAYER_SPONSOR_MAX_WEI is not set. */
export const DEFAULT_SPONSOR_PER_TX_WEI = 10_000_000_000_000_000n; // 0.01 MON

export const DEFAULT_RELAY_CONFIG: RelayPolicyConfig = {
  maxRequestsPerMinutePerIp: 10,
  maxSponsorPerTxWei: DEFAULT_SPONSOR_PER_TX_WEI,
  maxDailySponsorPerIpWei: 20_000_000_000_000_000n, // 0.02 MON
  maxDailyGlobalSponsorWei: 200_000_000_000_000_000n, // 0.2 MON
};

/**
 * Parses RELAYER_SPONSOR_MAX_WEI. Unset or blank uses the default; 0 turns vault sponsorship off.
 * A value that is not a whole number of wei (e.g. "0.01") also turns it off rather than guessing.
 */
export function sponsorCapFromEnv(raw: string | undefined, fallback = DEFAULT_SPONSOR_PER_TX_WEI): bigint {
  const v = raw?.trim();
  if (!v) return fallback;
  try {
    const wei = BigInt(v);
    return wei > 0n ? wei : 0n;
  } catch {
    return 0n;
  }
}

/** Relay policy for this deployment: the defaults plus the operator's sponsorship cap. */
export function relayConfigFromEnv(env: Record<string, string | undefined> = process.env): RelayPolicyConfig {
  return { ...DEFAULT_RELAY_CONFIG, maxSponsorPerTxWei: sponsorCapFromEnv(env.RELAYER_SPONSOR_MAX_WEI) };
}

const mon = (wei: bigint) => `${formatEther(wei)} MON`;

/**
 * Gas limit for a relayed transaction: the estimate plus 25% headroom, capped at `max`.
 * Null when the estimate alone is above `max`: a lower limit would be a certain out-of-gas
 * revert, and Monad bills the whole limit.
 */
export function relayGasLimit(estimate: bigint, max: bigint): bigint | null {
  if (estimate > max) return null;
  const padded = (estimate * 5n) / 4n;
  return padded > max ? max : padded;
}

/**
 * Vault sponsorship never eats into the gas the relayer needs: it is kept only when `balance`
 * still covers `gasWei` on top of it, otherwise dropped to 0. `payable` is false when the
 * relayer cannot pay even the gas.
 */
export function sponsorWithinBalance(balance: bigint, gasWei: bigint, sponsorWei: bigint): { sponsorWei: bigint; payable: boolean } {
  if (balance >= gasWei + sponsorWei) return { sponsorWei, payable: true };
  return { sponsorWei: 0n, payable: balance >= gasWei };
}

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
    if (requestedWei < 0n) return { allowed: false, reason: 'Sponsored funding cannot be negative' };

    const maxPerTx = this.config.maxSponsorPerTxWei ?? DEFAULT_RELAY_CONFIG.maxSponsorPerTxWei!;
    if (maxPerTx <= 0n) {
      return { allowed: false, reason: 'Vault sponsorship is turned off on this deployment' };
    }
    if (requestedWei > maxPerTx) {
      return { allowed: false, reason: `Sponsored funding exceeds per-transaction cap of ${mon(maxPerTx)}` };
    }

    const oneDay = 24 * 60 * 60 * 1000;
    const maxDailyPerIp = this.config.maxDailySponsorPerIpWei ?? DEFAULT_RELAY_CONFIG.maxDailySponsorPerIpWei!;
    const ipHistory = (this.spendByIp.get(ip) || []).filter((s) => now - s.timestamp < oneDay);
    const ipTotal = ipHistory.reduce((acc, s) => acc + s.amount, 0n);

    if (ipTotal + requestedWei > maxDailyPerIp) {
      return { allowed: false, reason: `Daily sponsored funding cap of ${mon(maxDailyPerIp)} reached for this IP` };
    }

    const maxDailyGlobal = this.config.maxDailyGlobalSponsorWei ?? DEFAULT_RELAY_CONFIG.maxDailyGlobalSponsorWei!;
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
    this.requestsByIp.clear();
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
