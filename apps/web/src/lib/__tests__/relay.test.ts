import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  RelayPolicyTracker,
  validateRelayCalldata,
  CREATE_SELECTOR,
  REVOKE_SELECTOR,
  WITHDRAW_SELECTOR,
  DEFAULT_RELAY_CONFIG,
  DEFAULT_SPONSOR_PER_TX_WEI,
  relayConfigFromEnv,
  relayGasLimit,
  sponsorCapFromEnv,
  sponsorWithinBalance,
} from '../relayPolicy';

const MON = 1_000_000_000_000_000_000n;

describe('Relay Security & Policy Tests', () => {
  let tracker: RelayPolicyTracker;

  beforeEach(() => {
    tracker = new RelayPolicyTracker({
      maxRequestsPerMinutePerIp: 3,
      maxSponsorPerTxWei: 10_000n,
      maxDailySponsorPerIpWei: 20_000n,
      maxDailyGlobalSponsorWei: 50_000n,
    });
  });

  it('validates only allowed owner selectors', () => {
    // createMandate
    const validCreate = validateRelayCalldata(`${CREATE_SELECTOR}1234567890abcdef`);
    assert.equal(validCreate.valid, true);
    assert.equal(validCreate.isCreate, true);

    // revoke
    const validRevoke = validateRelayCalldata(`${REVOKE_SELECTOR}1234567890abcdef`);
    assert.equal(validRevoke.valid, true);
    assert.equal(validRevoke.isCreate, false);

    // withdraw
    const validWithdraw = validateRelayCalldata(`${WITHDRAW_SELECTOR}1234567890abcdef`);
    assert.equal(validWithdraw.valid, true);

    // arbitrary function selector (e.g. transfer or execute)
    const invalidSelector = validateRelayCalldata('0xa9059cbb000000000000000000000000');
    assert.equal(invalidSelector.valid, false);
    assert.match(invalidSelector.error!, /Only authorized owner actions/);

    // malformed calldata
    const malformed = validateRelayCalldata('0x123');
    assert.equal(malformed.valid, false);
  });

  it('enforces rate limits per IP', () => {
    const ip = '1.2.3.4';
    assert.equal(tracker.checkRateLimit(ip).allowed, true);
    assert.equal(tracker.checkRateLimit(ip).allowed, true);
    assert.equal(tracker.checkRateLimit(ip).allowed, true);

    // 4th request exceeds maxRequestsPerMinutePerIp = 3
    const blocked = tracker.checkRateLimit(ip);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds! > 0);

    // different IP is not affected
    assert.equal(tracker.checkRateLimit('5.6.7.8').allowed, true);
  });

  it('enforces per-transaction sponsored spend limit', () => {
    const ip = '1.2.3.4';
    const overLimit = tracker.checkSponsorCap(ip, 15_000n);
    assert.equal(overLimit.allowed, false);
    assert.match(overLimit.reason!, /exceeds per-transaction cap/);

    const withinLimit = tracker.checkSponsorCap(ip, 5_000n);
    assert.equal(withinLimit.allowed, true);
  });

  it('enforces rolling daily per-IP spend cap', () => {
    const ip = '1.2.3.4';
    tracker.recordSpend(ip, 10_000n);
    tracker.recordSpend(ip, 8_000n);

    // Total spent so far = 18,000n. Adding 5,000n exceeds 20,000n cap.
    const capped = tracker.checkSponsorCap(ip, 5_000n);
    assert.equal(capped.allowed, false);
    assert.match(capped.reason!, /Daily sponsored funding cap .*reached for this IP/);

    // Adding 2,000n exactly reaches 20,000n cap.
    const exact = tracker.checkSponsorCap(ip, 2_000n);
    assert.equal(exact.allowed, true);
  });

  it('enforces global daily spend cap', () => {
    tracker.recordSpend('ip-1', 10_000n);
    tracker.recordSpend('ip-2', 10_000n);
    tracker.recordSpend('ip-3', 10_000n);
    tracker.recordSpend('ip-4', 10_000n);
    tracker.recordSpend('ip-5', 9_000n);

    // Global spend is now 49,000n. Adding 5,000n from a new IP exceeds 50,000n global cap.
    const globalBlocked = tracker.checkSponsorCap('ip-6', 5_000n);
    assert.equal(globalBlocked.allowed, false);
    assert.match(globalBlocked.reason!, /Global daily sponsored relayer budget reached/);
  });

  it('rejects any sponsorship when the per-transaction cap is 0', () => {
    const off = new RelayPolicyTracker({ ...DEFAULT_RELAY_CONFIG, maxSponsorPerTxWei: 0n });
    const blocked = off.checkSponsorCap('1.2.3.4', 1n);
    assert.equal(blocked.allowed, false);
    assert.match(blocked.reason!, /turned off/);
    assert.equal(off.checkSponsorCap('1.2.3.4', 0n).allowed, true);
  });

  it('rejects a negative sponsorship request', () => {
    assert.equal(tracker.checkSponsorCap('1.2.3.4', -1n).allowed, false);
  });
});

describe('Relay sponsorship config (RELAYER_SPONSOR_MAX_WEI)', () => {
  it('defaults to 0.01 MON per grant when unset or blank', () => {
    assert.equal(DEFAULT_SPONSOR_PER_TX_WEI, MON / 100n);
    assert.equal(sponsorCapFromEnv(undefined), MON / 100n);
    assert.equal(sponsorCapFromEnv(''), MON / 100n);
    assert.equal(sponsorCapFromEnv('   '), MON / 100n);
  });

  it('honours an explicit value, and 0 turns sponsorship off', () => {
    assert.equal(sponsorCapFromEnv('0'), 0n);
    assert.equal(sponsorCapFromEnv('20000000000000000'), 20_000_000_000_000_000n);
    assert.equal(sponsorCapFromEnv(' 5000 '), 5_000n);
  });

  it('turns sponsorship off for values that are not whole wei', () => {
    assert.equal(sponsorCapFromEnv('0.01'), 0n);
    assert.equal(sponsorCapFromEnv('1e16'), 0n);
    assert.equal(sponsorCapFromEnv('-5'), 0n);
    assert.equal(sponsorCapFromEnv('off'), 0n);
  });

  it('builds the deployment config from the env with lowered daily caps', () => {
    assert.equal(DEFAULT_RELAY_CONFIG.maxDailySponsorPerIpWei, (MON * 2n) / 100n);
    assert.equal(DEFAULT_RELAY_CONFIG.maxDailyGlobalSponsorWei, (MON * 2n) / 10n);

    const off = relayConfigFromEnv({ RELAYER_SPONSOR_MAX_WEI: '0' });
    assert.equal(off.maxSponsorPerTxWei, 0n);
    assert.equal(off.maxDailySponsorPerIpWei, DEFAULT_RELAY_CONFIG.maxDailySponsorPerIpWei);
    assert.equal(off.maxDailyGlobalSponsorWei, DEFAULT_RELAY_CONFIG.maxDailyGlobalSponsorWei);

    assert.equal(relayConfigFromEnv({}).maxSponsorPerTxWei, MON / 100n);
    assert.equal(relayConfigFromEnv({ RELAYER_SPONSOR_MAX_WEI: '7' }).maxSponsorPerTxWei, 7n);
  });

  it('allows two default grants per IP per day, then stops sponsoring', () => {
    const t = new RelayPolicyTracker(relayConfigFromEnv({}));
    const grant = MON / 100n;
    for (let i = 0; i < 2; i++) {
      assert.equal(t.checkSponsorCap('9.9.9.9', grant).allowed, true);
      t.recordSpend('9.9.9.9', grant);
    }
    assert.equal(t.checkSponsorCap('9.9.9.9', grant).allowed, false);
    assert.equal(t.checkSponsorCap('8.8.8.8', grant).allowed, true);
  });
});

describe('Relay gas and balance decisions', () => {
  const MAX = 1_200_000n;

  it('pads the estimate by 25% and caps it at the ceiling', () => {
    assert.equal(relayGasLimit(100_000n, MAX), 125_000n);
    assert.equal(relayGasLimit(1_000_000n, MAX), MAX);
    assert.equal(relayGasLimit(MAX, MAX), MAX);
  });

  it('refuses when the estimate itself is above the ceiling', () => {
    assert.equal(relayGasLimit(MAX + 1n, MAX), null);
    assert.equal(relayGasLimit(1_500_000n, MAX), null);
  });

  it('keeps sponsorship when the balance covers gas plus the vault funding', () => {
    assert.deepEqual(sponsorWithinBalance(100n, 60n, 40n), { sponsorWei: 40n, payable: true });
  });

  it('drops sponsorship but still relays when the balance only covers gas', () => {
    assert.deepEqual(sponsorWithinBalance(99n, 60n, 40n), { sponsorWei: 0n, payable: true });
    assert.deepEqual(sponsorWithinBalance(60n, 60n, 40n), { sponsorWei: 0n, payable: true });
  });

  it('reports unpayable only when the balance cannot cover gas', () => {
    assert.deepEqual(sponsorWithinBalance(59n, 60n, 40n), { sponsorWei: 0n, payable: false });
    assert.deepEqual(sponsorWithinBalance(59n, 60n, 0n), { sponsorWei: 0n, payable: false });
  });
});
