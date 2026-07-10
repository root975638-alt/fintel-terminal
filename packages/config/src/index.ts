/**
 * Typed application configuration, validated at startup. All operational knobs
 * (rate limits, cache TTLs, DB path, ports) are configurable via env vars with
 * safe production-grade defaults, per spec Section 3 ("make everything configurable").
 */
import { z } from "zod";

const ConfigSchema = z.object({
  // --- Persistence ---
  // CONFIG DEFAULT — verify for your deployment: local SQLite file under data-local/.
  DB_DRIVER: z.enum(["sqlite", "postgres"]).default("sqlite"),
  SQLITE_PATH: z.string().default("./data-local/fintel.db"),
  POSTGRES_URL: z.string().optional(),

  // --- API Gateway ---
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4310),
  API_HOST: z.string().default("127.0.0.1"),

  // --- Compliance / networking ---
  // NOTE: some sources (notably SEC EDGAR, verified live) reject User-Agent strings
  // containing parentheses/URLs with a 403, even though their own docs show an
  // example like "Sample Company Name AdminContact@sample.com". Kept simple
  // (name + contact) for maximum compatibility while still being honest/identifiable.
  HTTP_USER_AGENT: z.string().default("fintel-terminal-research contact@fintel-terminal.dev"),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  HTTP_CACHE_DIR: z.string().default("./data-local/http-cache"),
  HTTP_CACHE_DEFAULT_TTL_MS: z.coerce.number().int().positive().default(10 * 60_000),

  // --- FRED API (free registration key required by FRED itself, not a paid API) ---
  FRED_API_KEY: z.string().optional(),

  // --- Logging ---
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  LOG_FORMAT: z.enum(["json", "pretty"]).default("pretty"),

  // --- CLI ---
  CLI_DEFAULT_MARKET: z.enum(["US_EQUITIES", "NSE", "BSE", "CRYPTO", "FOREX"]).default("US_EQUITIES"),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let cachedConfig: AppConfig | undefined;

/**
 * Loads and validates config from process.env. Throws a descriptive error at startup
 * if required values are missing/invalid, rather than failing confusingly later.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cachedConfig) return cachedConfig;
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  cachedConfig = result.data;
  return cachedConfig;
}

/** Test-only helper to reset the memoized config between test cases. */
export function resetConfigCache(): void {
  cachedConfig = undefined;
}

export * from "./sourceRegistry.js";
