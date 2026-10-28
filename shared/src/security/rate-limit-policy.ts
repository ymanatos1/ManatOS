/**
 * ManatOS rate-limiting policies.
 *
 * These defaults protect authentication endpoints against automated
 * repeated requests, password guessing and account enumeration.
 *
 * The values are intentionally centralized here:
 * - Do not duplicate numbers in API or UI server route handlers.
 * - Different operations may use different policies.
 * - A server may supply its own RateLimitPolicy when necessary.
 *
 * Counters are kept in memory separately by each server process.
 * Restarting a server resets its counters.
 */
export interface RateLimitPolicy {
  /** Maximum accepted events within the rolling time window. */
  readonly limit: number;

  /** Length of the rolling time window, in milliseconds. */
  readonly windowMs: number;
}

/**
 * Maximum number of distinct active rate-limit keys per process.
 *
 * Prevents unbounded memory growth when attackers continually submit
 * new user names, email addresses or other identities.
 */
export const RATE_LIMIT_MAX_KEYS = 20_000;

/**
 * Interval for opportunistic cleanup of expired counters.
 *
 * Cleanup runs during ordinary limiter operations.
 * No background timer or scheduled service is required.
 */
export const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000;

/**
 * Default authentication policies.
 *
 * These limits are deliberately temporary. They must not permanently
 * lock user accounts, and blocked requests must report Retry-After.
 */
export const AUTH_RATE_LIMITS = {
  /**
   * Local Sign In: incorrect credentials.
   *
   * Allow five failed attempts for the same normalized identity
   * AND client IP within ten minutes.
   *
   * - Only incorrect credentials count.
   * - API failures and connectivity problems do not count.
   * - Successful credential verification clears this counter.
   * - Unknown and existing user identities receive the same policy.
   */
  loginFailures: {
    limit: 5,
    windowMs: 10 * 60_000,
  },

  /**
   * Local Sign In: overall traffic per client IP.
   *
   * Allow thirty login requests within ten minutes, regardless of
   * which user names or emails are supplied.
   *
   * This reduces password-spraying attacks against multiple accounts.
   * Unlike loginFailures, successful requests also count.
   */
  loginByIp: {
    limit: 30,
    windowMs: 10 * 60_000,
  },

  /**
   * Password reminder.
   *
   * Allow three recovery requests for the same identity/IP within
   * fifteen minutes, reducing email flooding and recovery abuse.
   */
  passwordRecovery: {
    limit: 3,
    windowMs: 15 * 60_000,
  },

  /**
   * Email registration.
   *
   * Allow five registration requests per IP within fifteen minutes,
   * reducing automated account creation.
   */
  registration: {
    limit: 5,
    windowMs: 15 * 60_000,
  },

  /**
   * External-provider authentication.
   *
   * Allow ten OAuth initiation attempts per IP within ten minutes.
   * This protects redirects and temporary OAuth challenge creation.
   */
  oauthInitiation: {
    limit: 10,
    windowMs: 10 * 60_000,
  },

  /** Several native clients may poll behind one NAT/proxy address. */
  nativeOAuthClaimByIp: {
    limit: 1800,
    windowMs: 10 * 60_000,
  },

  /** Bound polls/proof attempts for one native sign-in reservation. */
  nativeOAuthClaimByAttempt: {
    limit: 360,
    windowMs: 10 * 60_000,
  },

  /** Browser/device confirmation submissions per IP and per attempt. */
  nativeOAuthApproval: {
    limit: 10,
    windowMs: 10 * 60_000,
  },
} as const satisfies Record<string, RateLimitPolicy>;

/**
 * Maximum lifetime of an unfinished authentication reservation.
 *
 * An API request reserves a slot before checking a password. Normally
 * that slot is released or converted into a failed attempt afterward.
 *
 * This safety limit prevents an abandoned operation from occupying
 * a slot forever.
 */
export const RATE_LIMIT_RESERVATION_MAX_MS = 60_000;
