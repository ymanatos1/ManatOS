import 'dotenv/config';

import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional();

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
   * Controls whether collapsible UI shell state survives navigation.
   *
   * none:
   *   Every page starts from its server-rendered default.
   *
   * browser:
   *   State is persisted in browser localStorage.
   *
   * A future "user" mode can store preferences in SysUser/profile data.
   */
  UI_NAVIGATION_STATE_PERSISTENCE: z.enum(['none', 'browser']).default('browser'),

  /**
   * Allows an authenticated Admin to mark another SysUser's email as verified
   * from the administration UI. The API/internal route remains the final
   * server-side mutation boundary.
   */
  ALLOW_ADMIN_EMAIL_VERIFICATION: z
    .string()
    .default('true')
    .transform((value) => value === 'true'),

  GOOGLE_CLIENT_ID: optionalString,

  GOOGLE_CLIENT_SECRET: optionalString,

  GOOGLE_CALLBACK_URL: optionalString,

  FACEBOOK_CLIENT_ID: optionalString,

  FACEBOOK_CLIENT_SECRET: optionalString,

  FACEBOOK_CALLBACK_URL: optionalString,
});

export const config = schema.parse(process.env);
