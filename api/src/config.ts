import 'dotenv/config';
import { z } from 'zod';
const schema=z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'),
 API_PORT:z.coerce.number().int().positive().default(3000), DATA_FILE:z.string().default('../data/database.json'),
 INTERNAL_API_KEY:z.string().min(8), API_ERROR_DETAIL_LEVEL:z.enum(['none','basic','operations','full']).default('basic'),
 BOOTSTRAP_ADMIN_NAME:z.string().optional(), BOOTSTRAP_ADMIN_EMAIL:z.string().email().optional(), BOOTSTRAP_ADMIN_PASSWORD:z.string().optional()
});
export const config=schema.parse(process.env);
