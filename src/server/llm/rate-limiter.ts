export class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private maxRpm: number;
  private callTimestamps: number[] = [];

  /** Optional subscriber for status messages (e.g. backoff notifications) */
  onStatus?: (msg: string) => void;

  constructor(maxRpm: number = 15) {
    this.maxRpm = maxRpm;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await this.executeWithBackoff(fn);
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.queue.length === 0) return;

    // Remove timestamps older than 60 seconds
    const now = Date.now();
    this.callTimestamps = this.callTimestamps.filter(t => now - t < 60000);

    if (this.callTimestamps.length >= this.maxRpm) {
      const oldest = this.callTimestamps[0];
      const waitMs = Math.max(500, 60000 - (now - oldest) + 100);
      const msg = `[RateLimiter] RPM limit (${this.maxRpm}) reached — waiting ${Math.round(waitMs / 1000)}s before next call.`;
      console.warn(msg);
      this.onStatus?.(msg);
      setTimeout(() => this.processQueue(), waitMs);
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.callTimestamps.push(Date.now());
    await task();
    this.processQueue();
  }

  private async executeWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err: any) {
        attempt++;
              const errStatus = err?.status ?? err?.statusCode ?? 0;
        const isQuota429 = errStatus === 429 && isDailyQuota429(err);
        const isRetriableOrStatus503 = errStatus === 503 || (errStatus === 429 && !isQuota429);
        if (isRetriableOrStatus503 && attempt <= maxRetries) {
          const delaySecs = Math.max(1, err?.retryDelay ?? estimateBackoffSecs(attempt));
          const delay = delaySecs * 1000;
          const msg = `[RateLimiter] ${isQuota429 ? 'Daily-quota' : 'Rate-limited'} ${errStatus} — backing off ${Math.round(delay / 1000)}s (attempt ${attempt}/${maxRetries})…`;
          console.warn(msg);
          this.onStatus?.(msg);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        if (isQuota429) {
          // Do not retry daily quotas: they do not resolve by waiting a few seconds.
          throw err;
        }
        throw err;
      }
    }
  }
}

const rpm = parseInt(process.env.LLM_MAX_RPM || '15', 10);
export const globalRateLimiter = new RateLimiter(rpm);

/**
 * A 429 is a daily-quota failure when the provider's per-day quota for this
 * model is exhausted. API error bodies rarely expose a clean code, so we treat
 * any 429 that carries a long retryDelay (>120s) or a quota identifier with
 * 'perday' in it as a daily quota issue.
 */
export function isDailyQuota429(err: any): boolean {
  if (err?.status !== 429 && err?.statusCode !== 429) return false;
  const delay = Number(err?.retryDelay ?? 0);
  if (delay > 120) return true;
  const body = String(err?.message ?? err?.body ?? '');
  const quotaPart = err?.quotaId != null ? String(err?.quotaId).toLowerCase() : body.toLowerCase();
  return quotaPart.includes('perday') || body.includes('quota') && (body.includes('daily') || body.includes('per day'));
}

function estimateBackoffSecs(attempt: number): number {
  // Short rate-limit backoff is not the same as a daily quota window.
  const base = Math.pow(2, Math.min(attempt, 6)) * 1000;
  return Math.round(base / 1000);
}

