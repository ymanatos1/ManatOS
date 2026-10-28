import 'dotenv/config';

import { z } from 'zod';

/**
 * Runtime API configuration.
 *
 * Environment variables are parsed and validated once during
 * application startup.
 *
 * Invalid configuration therefore fails fast rather than producing
 * less obvious runtime errors later.
 */
const schema = z.object({
  /**
   * Standard Node.js execution environment.
   */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * HTTP port used by the Express API.
   */
  API_PORT: z.coerce.number().int().positive().default(3000),

  /**
   * API access token expiration time in minutes.
   */
  API_ACCESS_TOKEN_MINUTES: z.coerce.number().int().positive().default(60),

  /** Public HTTPS API origin where external providers redirect native sign-in callbacks.
   * Leave unset to disable native OAuth without affecting password/browser auth. */
  API_PUBLIC_BASE_URL: z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      try {
        const url = new URL(value);
        if (
          url.username ||
          url.password ||
          url.pathname !== '/' ||
          url.search ||
          url.hash ||
          !['https:', 'http:'].includes(url.protocol)
        )
          throw new Error('invalid origin');
        if (
          url.protocol !== 'https:' &&
          !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        )
          throw new Error('HTTPS required except loopback');
        return url.origin;
      } catch {
        ctx.addIssue({
          code: 'custom',
          message:
            'API_PUBLIC_BASE_URL must be a public HTTPS origin (HTTP loopback is allowed for local development).',
        });
        return z.NEVER;
      }
    }),

  /**
   * Browser CORS policy.
   *
   * Production/first-party browser origins are explicit and environment-managed.
   * Development may additionally allow HTTP(S) loopback origins on any port so
   * local browser UIs do not require a new configuration entry for every dev port.
   */
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((value, ctx) => {
      const origins: string[] = [];

      for (const entry of value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)) {
        if (entry === '*') {
          ctx.addIssue({
            code: 'custom',
            message:
              'CORS_ALLOWED_ORIGINS must contain explicit origins; wildcard * is not allowed.',
          });
          continue;
        }

        try {
          const url = new URL(entry);
          if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.pathname !== '/' ||
            url.search ||
            url.hash
          ) {
            throw new Error('not an HTTP(S) origin');
          }
          origins.push(url.origin);
        } catch {
          ctx.addIssue({
            code: 'custom',
            message: `Invalid CORS origin "${entry}". Use an explicit HTTP(S) origin such as https://app.example.com.`,
          });
        }
      }

      return [...new Set(origins)];
    }),

  CORS_ALLOW_DEVELOPMENT_LOOPBACK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  /** Reserved for a future deliberate cookie/session CORS mode. Bearer auth does not require it. */
  CORS_ALLOW_CREDENTIALS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  /** Browser preflight cache lifetime. */
  CORS_PREFLIGHT_MAX_AGE_SECONDS: z.coerce.number().int().nonnegative().default(600),

  /**
   * Default and upper-bound page sizes for generic API list queries.
   * The API accepts any positive requested page size up to this maximum;
   * the UI independently controls which choices it presents to users.
   */
  API_DEFAULT_PAGE_SIZE: z.coerce.number().int().positive().default(10),

  API_MAX_PAGE_SIZE: z.coerce.number().int().positive().default(500),

  /**
   * JSON persistence file used by the current in-memory datastore.
   */
  DATA_FILE: z.string().default('../data/database.json'),

  /** Bootstrap/system settings persisted independently of the active datastore. */
  SYSTEM_SETTINGS_FILE: z.string().default('../data/system-settings.json'),

  /**
   * Shared secret protecting trusted internal API operations.
   */
  INTERNAL_API_KEY: z.string().min(8),

  /**
   * Dedicated shared secret for trusted UI-server client-IP delegation.
   *
   * Optional because direct public API clients do not delegate their IP.
   * When NG1 is deployed, configure the same value on both servers.
   *
   * Do not reuse INTERNAL_API_KEY: that key has different privileges.
   */
  AUTH_DELEGATION_SECRET: z.string().min(32).optional(),

  /**
   * Controls how much diagnostic information is returned by the API.
   *
   * none
   * basic
   * operations
   * full
   */
  API_ERROR_DETAIL_LEVEL: z.enum(['none', 'basic', 'operations', 'full']).default('basic'),

  /**
   * Central server logging configuration.
   *
   * Each persistence destination is enabled by providing its location.
   * Empty/omitted locations disable that sink, avoiding separate ENABLED flags.
   */
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
  LOG_CONSOLE_MIN_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).optional(),

  /**
   * Persistent file logging. Relative paths are resolved from the API process
   * working directory. Empty values disable the corresponding file sink.
   */
  LOG_FILE_PATH: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  LOG_FILE_MIN_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_ERROR_FILE_PATH: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  LOG_ERROR_FILE_MIN_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('error'),
  LOG_FILE_MAX_BYTES: z.coerce.number().int().positive().default(5_242_880),

  /**
   * Reserved database logging configuration.
   *
   * The database sink is intentionally not coupled to the primary datastore.
   * A non-empty URL will enable it once the dedicated sink/provider is added.
   */
  LOG_DATABASE_URL: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  LOG_DATABASE_MIN_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('error'),

  /**
   * Master key used to encrypt reversible application secrets at rest.
   * The key itself must remain outside the database.
   */
  SECRETS_ENCRYPTION_ACTIVE_KEY_ID: z.string().trim().min(1).default('v1'),
  SECRETS_ENCRYPTION_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  /** Server-side SMTP delivery. SMTP secrets must never be exposed to the UI/browser. */
  MAIL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().trim().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  MAIL_FROM_ADDRESS: z.string().email().optional(),
  MAIL_FROM_NAME: z.string().trim().min(1).default('ManatOS'),

  SMTP_TLS_REJECT_UNAUTHORIZED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  /**
   * Allows authenticated Admin users to explicitly verify another
   * SysBOUser email address through the dedicated command endpoint.
   */
  ADMIN_EMAIL_VERIFICATION_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  /**
   * Optional administrator bootstrap configuration.
   */
  BOOTSTRAP_ADMIN_NAME: z.string().optional(),

  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),

  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
});

/**
 * Validated application configuration.
 *
 * Importers receive typed values rather than raw process.env strings.
 */
const parsedConfig = schema.parse(process.env);

if (
  parsedConfig.NODE_ENV === 'production' &&
  parsedConfig.API_PUBLIC_BASE_URL &&
  !parsedConfig.API_PUBLIC_BASE_URL.startsWith('https://')
) {
  throw new Error('Native OAuth requires API_PUBLIC_BASE_URL to be HTTPS in production.');
}

if (parsedConfig.API_DEFAULT_PAGE_SIZE > parsedConfig.API_MAX_PAGE_SIZE) {
  throw new Error(
    `API_DEFAULT_PAGE_SIZE (${parsedConfig.API_DEFAULT_PAGE_SIZE}) cannot exceed API_MAX_PAGE_SIZE (${parsedConfig.API_MAX_PAGE_SIZE}).`,
  );
}

// Mail settings may be supplied by encrypted SysBOConfiguration after the datastore
// initializes, so startup validation cannot require them to exist in .env.

export const config = parsedConfig;
