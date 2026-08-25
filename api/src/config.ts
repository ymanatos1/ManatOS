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
   * Allows authenticated Admin users to explicitly verify another
   * SysUser email address through the dedicated command endpoint.
   *
   * Kept as a runtime feature switch because installations may prefer
   * verification to occur exclusively through email links/identity
   * providers.
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

export const config = parsedConfig;

