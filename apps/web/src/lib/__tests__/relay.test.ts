import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  RelayPolicyTracker,
  validateRelayCalldata,
  CREATE_SELECTOR,
  REVOKE_SELECTOR,
  WITHDRAW_SELECTOR,
} from '../relayPolicy';

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
    assert.match(capped.reason!, /Daily sponsored funding cap reached for this IP/);

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
});
