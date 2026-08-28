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

  /**
   * Shared secret protecting trusted internal API operations.
   */
  INTERNAL_API_KEY: z.string().min(8),

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
  LOG_FILE_PATH: z.string().trim().optional().transform((value) => value || undefined),
  LOG_FILE_MIN_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_ERROR_FILE_PATH: z.string().trim().optional().transform((value) => value || undefined),
  LOG_ERROR_FILE_MIN_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('error'),
  LOG_FILE_MAX_BYTES: z.coerce.number().int().positive().default(5_242_880),

  /**
   * Reserved database logging configuration.
   *
   * The database sink is intentionally not coupled to the primary datastore.
   * A non-empty URL will enable it once the dedicated sink/provider is added.
   */
  LOG_DATABASE_URL: z.string().trim().optional().transform((value) => value || undefined),
  LOG_DATABASE_MIN_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('error'),

  /**
   * Master key used to encrypt reversible application secrets at rest.
   * The key itself must remain outside the database.
   */
  SECRETS_ENCRYPTION_ACTIVE_KEY_ID: z.string().trim().min(1).default('v1'),
  SECRETS_ENCRYPTION_KEY: z.string().trim().optional().transform((value) => value || undefined),

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
   * SysUser email address through the dedicated command endpoint.
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

if (parsedConfig.API_DEFAULT_PAGE_SIZE > parsedConfig.API_MAX_PAGE_SIZE) {
  throw new Error(
    `API_DEFAULT_PAGE_SIZE (${parsedConfig.API_DEFAULT_PAGE_SIZE}) cannot exceed API_MAX_PAGE_SIZE (${parsedConfig.API_MAX_PAGE_SIZE}).`,
  );
}

// Mail settings may be supplied by encrypted SysConfiguration after the datastore
// initializes, so startup validation cannot require them to exist in .env.


export const config = parsedConfig;
