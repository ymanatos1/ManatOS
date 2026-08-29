import 'dotenv/config';

import { z } from 'zod';

const positiveIntegerList = z
  .string()
  .default('2,5,10,20,50,100')
  .transform((value, ctx) => {
    const values = value
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((part) => Number.isInteger(part) && part > 0);

    const uniqueSorted = [...new Set(values)].sort((a, b) => a - b);

    if (!uniqueSorted.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'At least one positive page-size option is required.',
      });

      return z.NEVER;
    }

    return uniqueSorted;
  });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  UI_PORT: z.coerce.number().int().positive().default(3001),

  API_BASE_URL: z.string().url().default('http://localhost:3000'),

  INTERNAL_API_KEY: z.string().min(8),

  SESSION_SECRET: z.string().min(16),

  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().positive().default(30),

  SESSION_ERROR_LOG_MAX_ENTRIES: z.coerce.number().int().positive().default(20),

  SHOW_TECHNICAL_ERROR_DETAILS: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),


  /**
   * Default SysBO pagination settings used by the UI definition registry.
   * Individual SysBO definitions may still override these values later.
   */
  UI_PAGE_SIZE_OPTIONS: positiveIntegerList,

  UI_DEFAULT_PAGE_SIZE: z.coerce.number().int().positive().default(10),

  /**
   * Controls whether collapsible UI shell state survives navigation.
   *
   * none:
   *   Every page starts from its server-rendered default.
   *
   * browser:
   *   State is persisted in browser localStorage.
   *
   * A future "user" mode can store preferences in SysBOUser/profile data.
   */
  UI_NAVIGATION_STATE_PERSISTENCE: z.enum(['none', 'browser']).default('browser'),

  /**
   * Allows an authenticated Admin to mark another SysBOUser's email as verified
   * from the administration UI. The API/internal route remains the final
   * server-side mutation boundary.
   */
  ALLOW_ADMIN_EMAIL_VERIFICATION: z
    .string()
    .default('true')
    .transform((value) => value === 'true'),

  /** Public origin used to turn persisted relative OAuth callback paths into absolute URLs. */
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3001'),
});

const parsedConfig = schema.parse(process.env);

if (!parsedConfig.UI_PAGE_SIZE_OPTIONS.includes(parsedConfig.UI_DEFAULT_PAGE_SIZE)) {
  throw new Error(
    `UI_DEFAULT_PAGE_SIZE (${parsedConfig.UI_DEFAULT_PAGE_SIZE}) must be included in UI_PAGE_SIZE_OPTIONS (${parsedConfig.UI_PAGE_SIZE_OPTIONS.join(',')}).`,
  );
}

export const config = parsedConfig;

