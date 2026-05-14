import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "..", "..");
loadEnv({ path: path.join(repoRoot, ".env") });
loadEnv({ path: path.join(apiRoot, ".env"), override: true });

const envSchema = z
  .object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1),
  MONGODB_DATABASE: z.string().optional(),
  APP_NAME: z.string().optional(),
  APP_URL: z.string().optional(),
  APP_TIMEZONE: z.string().optional(),
  /** When true, sessions use Redis and BullMQ image uploads work. When false, sessions are in-memory (single process). */
  USE_REDIS: z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return false;
    if (typeof v === "boolean") return v;
    if (typeof v !== "string") return false;
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }, z.boolean()),
  REDIS_URL: z.string().optional(),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().default(3001),
  SESSION_COOKIE_NAME: z.string().default("br_session"),
  SESSION_SECRET: z.string().min(32),
  /** HS256 signing key for JWT access/refresh; defaults to SESSION_SECRET when unset. */
  JWT_SECRET: z.string().min(32).optional(),
  /** Access JWT TTL (seconds). */
  JWT_ACCESS_TTL_SEC: z.coerce.number().min(60).default(900),
  /** Refresh JWT TTL (seconds); cookie Max-Age matches. */
  JWT_REFRESH_TTL_SEC: z.coerce.number().min(300).default(60 * 60 * 24 * 7),
  WEB_ORIGIN: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().optional(),
  TRUST_PROXY: z.coerce.boolean().default(false),
  COOKIE_SECURE: z.coerce.boolean().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_UPLOAD_PREFIX: z.string().default("backroar"),
  /** Prefix for auto-generated variant retail barcodes (TSPL / POS parity). */
  BARCODE_PREFIX: z.string().max(8).default("B"),
})
  .superRefine((data, ctx) => {
    if (data.USE_REDIS && !(data.REDIS_URL && data.REDIS_URL.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REDIS_URL is required when USE_REDIS is true",
        path: ["REDIS_URL"],
      });
    }
  });

export const env = envSchema.parse(process.env);
