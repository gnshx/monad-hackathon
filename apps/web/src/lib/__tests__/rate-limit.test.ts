import { strict as assert } from 'node:assert';
import { test, beforeEach } from 'node:test';
import { checkRateLimit, recordExecution, resetRateLimit, DEFAULT_WINDOW_MS } from '../rate-limit.js';

test('Rate Limiter Tests', async (t) => {
  beforeEach(() => {
    resetRateLimit();
  });

  await t.test('allows initial request from an unseen IP', () => {
    const result = checkRateLimit('192.168.1.1');
    assert.equal(result.allowed, true);
    assert.equal(result.retryAfterSeconds, 0);
  });

  await t.test('blocks subsequent request within cooldown window and computes retryAfterSeconds', () => {
    const ip = '10.0.0.1';
    assert.equal(checkRateLimit(ip).allowed, true);

    recordExecution(ip);

    const blocked = checkRateLimit(ip);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds > 0);
    assert.ok(blocked.retryAfterSeconds <= Math.ceil(DEFAULT_WINDOW_MS / 1000));
  });

  await t.test('evaluates different IPs independently', () => {
    const ipA = '10.0.0.2';
    const ipB = '10.0.0.3';

    recordExecution(ipA);

    assert.equal(checkRateLimit(ipA).allowed, false);
    assert.equal(checkRateLimit(ipB).allowed, true);
  });

  await t.test('allows request again after window expires or after reset', () => {
    const ip = '10.0.0.4';
    recordExecution(ip);
    assert.equal(checkRateLimit(ip).allowed, false);

    resetRateLimit(ip);
    assert.equal(checkRateLimit(ip).allowed, true);
  });

  await t.test('respects custom window duration', () => {
    const ip = '10.0.0.5';
    recordExecution(ip);

    // With a 0ms window, should be allowed immediately
    assert.equal(checkRateLimit(ip, 0).allowed, true);
  });
});
