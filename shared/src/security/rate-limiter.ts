import {
  RATE_LIMIT_CLEANUP_INTERVAL_MS,
  RATE_LIMIT_MAX_KEYS,
  RATE_LIMIT_RESERVATION_MAX_MS,
  type RateLimitPolicy,
} from './rate-limit-policy.js';

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;

  /** Seconds to report through Retry-After when a request is denied. */
  readonly retryAfterSeconds: number;
}

export type RateLimitOutcome = 'failure' | 'release';

export interface RateLimitReservation {
  readonly decision: RateLimitDecision;

  /**
   * Finish an authentication attempt exactly once.
   *
   * failure: credentials were incorrect; count this failed attempt.
   * release: successful login or operational error; do not count a failure.
   */
  finish(outcome: RateLimitOutcome): void;
}

type Bucket = {
  windowMs: number;
  attempts: number[];
  pending: Map<number, number>;
};

/**
 * In-memory, single-process sliding-window rate limiter.
 *
 * Both API and UI hosts use this class, each with its own counters.
 *
 * record():
 *   Counts an immediate event, such as an incoming login request.
 *
 * reserve():
 *   Reserves capacity before an asynchronous password verification.
 *   Pending operations count against the limit, preventing concurrent
 *   requests from bypassing the failed-login threshold.
 *
 * clear():
 *   Clears completed failures after a successful authentication,
 *   without removing other requests' pending reservations.
 *
 * Counters are temporary and never permanently lock accounts.
 */
export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private sequence = 0;
  private lastCleanup = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxKeys = RATE_LIMIT_MAX_KEYS,
  ) {
    if (!Number.isSafeInteger(maxKeys) || maxKeys < 1) {
      throw new Error('Rate limiter maxKeys must be a positive integer.');
    }
  }

  check(key: string, policy: RateLimitPolicy): RateLimitDecision {
    return this.evaluate(key, policy, false);
  }

  record(key: string, policy: RateLimitPolicy): RateLimitDecision {
    return this.evaluate(key, policy, true);
  }

  /**
   * Reserve one attempt synchronously.
   *
   * Since allocation occurs before any await, parallel requests cannot
   * all pass the same stale check.
   */
  reserve(key: string, policy: RateLimitPolicy): RateLimitReservation {
    const decision = this.evaluate(key, policy, false);

    if (!decision.allowed) {
      return { decision, finish: () => {} };
    }

    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        windowMs: policy.windowMs,
        attempts: [],
        pending: new Map(),
      };
      this.buckets.set(key, bucket);
    }

    const id = ++this.sequence;
    bucket.pending.set(id, this.now());

    const reservedBucket = bucket;
    let finished = false;

    return {
      decision: { ...decision, remaining: decision.remaining - 1 },

      finish: (outcome) => {
        if (finished) return;
        finished = true;

        // An expired or removed reservation cannot be committed again.
        if (this.buckets.get(key) !== reservedBucket || !reservedBucket.pending.delete(id)) {
          return;
        }

        if (outcome === 'failure') {
          reservedBucket.attempts.push(this.now());
        }

        if (reservedBucket.attempts.length === 0 && reservedBucket.pending.size === 0) {
          this.buckets.delete(key);
        }
      },
    };
  }

  /**
   * Successful login clears past failures, but not other attempts
   * currently being verified.
   */
  clear(key: string): void {
    const bucket = this.buckets.get(key);
    if (!bucket) return;

    bucket.attempts = [];

    if (bucket.pending.size === 0) {
      this.buckets.delete(key);
    }
  }

  /** Remove expired failures and abandoned reservations. */
  prune(): void {
    const now = this.now();

    for (const [key, bucket] of this.buckets) {
      this.pruneBucket(bucket, now);

      if (bucket.attempts.length === 0 && bucket.pending.size === 0) {
        this.buckets.delete(key);
      }
    }

    this.lastCleanup = now;
  }

  private pruneBucket(bucket: Bucket, now: number): void {
    bucket.attempts = bucket.attempts.filter((time) => time > now - bucket.windowMs);

    for (const [id, started] of bucket.pending) {
      if (started <= now - RATE_LIMIT_RESERVATION_MAX_MS) {
        bucket.pending.delete(id);
      }
    }
  }

  private evaluate(key: string, policy: RateLimitPolicy, record: boolean): RateLimitDecision {
    if (!key) {
      throw new Error('Rate-limit key cannot be empty.');
    }

    if (
      !Number.isSafeInteger(policy.limit) ||
      policy.limit < 1 ||
      !Number.isSafeInteger(policy.windowMs) ||
      policy.windowMs < 1
    ) {
      throw new Error('Rate-limit policy requires positive integer limit and windowMs.');
    }

    const now = this.now();

    if (now - this.lastCleanup >= RATE_LIMIT_CLEANUP_INTERVAL_MS) {
      this.prune();
    }

    let bucket = this.buckets.get(key);

    if (bucket) {
      this.pruneBucket(bucket, now);
      bucket.windowMs = policy.windowMs;

      if (bucket.attempts.length === 0 && bucket.pending.size === 0) {
        this.buckets.delete(key);
        bucket = undefined;
      }
    }

    const count = (bucket?.attempts.length ?? 0) + (bucket?.pending.size ?? 0);

    if (count >= policy.limit) {
      // The earliest expiring event determines when capacity returns.
      const expiry = Math.min(
        ...(bucket?.attempts.map((time) => time + policy.windowMs) ?? []),
        ...(bucket
          ? [...bucket.pending.values()].map((time) => time + RATE_LIMIT_RESERVATION_MAX_MS)
          : []),
      );

      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((expiry - now) / 1000)),
      };
    }

    if (!bucket && this.buckets.size >= this.maxKeys) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(policy.windowMs / 1000),
      };
    }

    if (record) {
      if (bucket) {
        bucket.attempts.push(now);
      } else {
        this.buckets.set(key, {
          windowMs: policy.windowMs,
          attempts: [now],
          pending: new Map(),
        });
      }
    }

    return {
      allowed: true,
      remaining: policy.limit - count - (record ? 1 : 0),
      retryAfterSeconds: 0,
    };
  }
}
