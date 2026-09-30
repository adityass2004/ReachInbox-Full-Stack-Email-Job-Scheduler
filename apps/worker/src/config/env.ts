import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { DEFAULT_CONFIG } from "@reachinbox/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env.local (if present, takes precedence for local development) then .env
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config();

// Strip any surrounding quotes passed from Docker --env-file
for (const [key, val] of Object.entries(process.env)) {
  if (val && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
    process.env[key] = val.slice(1, -1);
  }
}

// Support standard environment variable aliases
if (!process.env.MAX_EMAILS_PER_HOUR_PER_SENDER && process.env.MAX_EMAILS_PER_HOUR) {
  process.env.MAX_EMAILS_PER_HOUR_PER_SENDER = process.env.MAX_EMAILS_PER_HOUR;
}
if (!process.env.MIN_EMAIL_DELAY_MS && process.env.EMAIL_SEND_DELAY_MS) {
  process.env.MIN_EMAIL_DELAY_MS = process.env.EMAIL_SEND_DELAY_MS;
}

const workerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SLACK_NOTIFICATION_CHANNEL_ID: z.string().optional().default(""),
  WORKER_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(DEFAULT_CONFIG.WORKER_CONCURRENCY),
  MIN_EMAIL_DELAY_MS: z.coerce
    .number()
    .min(0)
    .default(DEFAULT_CONFIG.MIN_EMAIL_DELAY_MS),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce
    .number()
    .positive()
    .default(DEFAULT_CONFIG.MAX_EMAILS_PER_HOUR_PER_SENDER),
});

const parsed = workerEnvSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    "[Worker Config Error] Invalid environment configuration:",
    parsed.error.format(),
  );
  if (process.env.NODE_ENV === "production") {
    throw new Error("Invalid worker environment configuration in production");
  }
}

const env = parsed.success
  ? parsed.data
  : {
      NODE_ENV: "development",
      REDIS_URL: "redis://localhost:6379",
      SLACK_NOTIFICATION_CHANNEL_ID: "",
      WORKER_CONCURRENCY: DEFAULT_CONFIG.WORKER_CONCURRENCY,
      MIN_EMAIL_DELAY_MS: DEFAULT_CONFIG.MIN_EMAIL_DELAY_MS,
      MAX_EMAILS_PER_HOUR_PER_SENDER: DEFAULT_CONFIG.MAX_EMAILS_PER_HOUR_PER_SENDER,
    };

export const config = {
  nodeEnv: env.NODE_ENV,
  redisUrl: env.REDIS_URL,
  slackNotificationChannelId: env.SLACK_NOTIFICATION_CHANNEL_ID,
  concurrency: env.WORKER_CONCURRENCY,
  minEmailDelayMs: env.MIN_EMAIL_DELAY_MS,
  maxEmailsPerHour: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
  serviceName: "reachinbox-worker",
  version: "1.0.0",
};
