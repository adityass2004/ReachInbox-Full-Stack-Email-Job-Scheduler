import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env or app .env if present
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

// Support standard environment variable aliases
if (!process.env.MAX_EMAILS_PER_HOUR_PER_SENDER && process.env.MAX_EMAILS_PER_HOUR) {
  process.env.MAX_EMAILS_PER_HOUR_PER_SENDER = process.env.MAX_EMAILS_PER_HOUR;
}

import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_API_KEY: z.string().optional(),
  ELASTICSEARCH_INDEX: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),
  BULL_BOARD_ADMIN_EMAILS: z.string().optional(),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().positive().default(200),
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  // eslint-disable-next-line no-console
  console.error('[API Config Error] Invalid environment configuration:', parsedEnv.error.format());
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Invalid environment configuration in production');
  }
}

const envValues = parsedEnv.success ? parsedEnv.data : ({} as Partial<z.infer<typeof envSchema>>);

const cleanEnvStr = (val?: string) => (val || '').replace(/^["']|["']$/g, '').trim();

export const config = {
  port: envValues.PORT ?? 4000,
  nodeEnv: envValues.NODE_ENV ?? 'development',
  corsOrigin: envValues.CORS_ORIGIN ?? 'http://localhost:3000',
  serviceName: 'reachinbox-api',
  version: '1.0.0',
  slackClientId: cleanEnvStr(process.env.SLACK_CLIENT_ID),
  slackClientSecret: cleanEnvStr(process.env.SLACK_CLIENT_SECRET),
  slackRedirectUri: cleanEnvStr(process.env.SLACK_REDIRECT_URI),
  googleClientId: cleanEnvStr(process.env.GOOGLE_CLIENT_ID),
  googleClientSecret: cleanEnvStr(process.env.GOOGLE_CLIENT_SECRET),
  googleCallbackUrl: cleanEnvStr(process.env.GOOGLE_CALLBACK_URL),
  jwtSecret: cleanEnvStr(process.env.JWT_SECRET),
  bullBoardAdminEmails: (process.env.BULL_BOARD_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  maxEmailsPerHour: envValues.MAX_EMAILS_PER_HOUR_PER_SENDER ?? 200,
};
