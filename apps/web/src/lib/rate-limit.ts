/**
 * In-memory rate limiter per IP address for Judge Mode execution.
 * Enforces a strict cooldown (default 2 minutes) to prevent faucet/relayer depletion.
 */

interface RateLimitEntry {
  lastExecution: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

export const DEFAULT_WINDOW_MS = 120_000; // 2 minutes

export function checkRateLimit(
  ip: string,
  windowMs: number = DEFAULT_WINDOW_MS
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const elapsed = now - entry.lastExecution;
  if (elapsed < windowMs) {
    const retryAfterSeconds = Math.ceil((windowMs - elapsed) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordExecution(ip: string): void {
  rateLimitMap.set(ip, { lastExecution: Date.now() });
}

export function resetRateLimit(ip?: string): void {
  if (ip) {
    rateLimitMap.delete(ip);
  } else {
    rateLimitMap.clear();
  }
}
