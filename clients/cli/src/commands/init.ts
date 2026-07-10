import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { loadConfig } from "@fintel/config";
import { openPersistenceLayer } from "@fintel/persistence";
import { style } from "../ui/terminal.js";

const ENV_TEMPLATE = `# FINTEL-TERMINAL local configuration
# CONFIG DEFAULT — verify for your deployment. See docs/CONFIGURATION.md for the full list.

# --- Persistence (local SQLite by default; zero external services required) ---
DB_DRIVER=sqlite
SQLITE_PATH=./data-local/fintel.db

# --- API Gateway ---
API_PORT=4310
API_HOST=127.0.0.1

# --- Compliance / networking ---
HTTP_USER_AGENT=fintel-terminal-research contact@fintel-terminal.dev
HTTP_CACHE_DIR=./data-local/http-cache

# --- FRED macro data (free self-service key, NOT a paid API) ---
# Register at https://fred.stlouisfed.org/docs/api/api_key.html
# FRED_API_KEY=

# --- CLI ---
CLI_DEFAULT_MARKET=US_EQUITIES
`;

export async function runInitCommand(): Promise<void> {
  if (!existsSync(".env")) {
    writeFileSync(".env", ENV_TEMPLATE, "utf-8");
    console.log(style.green("✓") + " Created .env with safe local defaults.");
  } else {
    console.log(style.dim("  .env already exists — leaving it untouched."));
  }

  mkdirSync("./data-local", { recursive: true });
  mkdirSync("./data-local/http-cache", { recursive: true });

  const config = loadConfig();
  const persistence = openPersistenceLayer(config.SQLITE_PATH);
  persistence.close();
  console.log(style.green("✓") + ` Initialized local SQLite database at ${config.SQLITE_PATH} (migrations applied).`);
  console.log(
    "\n" +
      style.bold("Ready.") +
      " Try: " +
      style.cyan("fintel quote CRYPTO:BTCUSDT") +
      "  or  " +
      style.cyan("fintel doctor"),
  );
}
