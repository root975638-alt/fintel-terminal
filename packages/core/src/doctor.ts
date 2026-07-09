/**
 * Doctor checks — environment/health diagnostics used by both `fintel doctor` (CLI)
 * and a future API health/admin endpoint. Verifies Node version, DB reachability,
 * cache directory writability, and config validity, printing actionable fixes
 * rather than a bare stack trace (spec Section 6.17: `fintel doctor`).
 */
import { accessSync, constants, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AppConfig } from "@fintel/config";
import { listDisabledSources, listEnabledSources } from "@fintel/config";

export interface DoctorCheckResult {
  readonly name: string;
  readonly status: "ok" | "warn" | "fail";
  readonly message: string;
}

function checkNodeVersion(): DoctorCheckResult {
  const [major] = process.versions.node.split(".").map(Number);
  if (major !== undefined && major >= 20) {
    return { name: "node-version", status: "ok", message: `Node ${process.versions.node} (>=20 required) — OK.` };
  }
  return {
    name: "node-version",
    status: "fail",
    message: `Node ${process.versions.node} detected; fintel requires Node >=20. Install Node 20+ LTS.`,
  };
}

function checkSqliteBuiltin(): DoctorCheckResult {
  const [majorStr, minorStr] = process.versions.node.split(".");
  const major = Number(majorStr);
  const minor = Number(minorStr);
  const sufficientVersion = major > 22 || (major === 22 && minor >= 5) || major >= 23;
  if (sufficientVersion) {
    return { name: "sqlite-builtin", status: "ok", message: "node:sqlite is available (built into Node >=22.5)." };
  }
  return {
    name: "sqlite-builtin",
    status: "fail",
    message:
      `Node ${process.versions.node} detected; node:sqlite requires Node >=22.5 (ships in Node core, ` +
      "no native compilation required — safe on Termux/ARM). Upgrade Node.",
  };
}

function checkWritableDir(name: string, dirPath: string): DoctorCheckResult {
  try {
    mkdirSync(dirPath, { recursive: true });
    accessSync(dirPath, constants.W_OK);
    return { name, status: "ok", message: `${dirPath} is writable.` };
  } catch (err) {
    return { name, status: "fail", message: `${dirPath} is not writable: ${(err as Error).message}` };
  }
}

function checkSourceRegistry(): DoctorCheckResult {
  const enabled = listEnabledSources();
  const disabled = listDisabledSources();
  return {
    name: "source-registry",
    status: "ok",
    message: `${enabled.length} data sources enabled, ${disabled.length} disabled (ToS-restricted): ${disabled
      .map((s) => s.sourceId)
      .join(", ")}.`,
  };
}

function checkFredKey(config: AppConfig): DoctorCheckResult {
  if (config.FRED_API_KEY) {
    return { name: "fred-api-key", status: "ok", message: "FRED_API_KEY is configured." };
  }
  return {
    name: "fred-api-key",
    status: "warn",
    message:
      "FRED_API_KEY is not set — macro data features will be unavailable. Register a free key at " +
      "https://fred.stlouisfed.org/docs/api/api_key.html and set FRED_API_KEY.",
  };
}

export interface DoctorReport {
  readonly generatedAtMs: number;
  readonly checks: readonly DoctorCheckResult[];
  readonly overall: "ok" | "warn" | "fail";
}

export function runDoctorChecks(config: AppConfig): DoctorReport {
  const checks: DoctorCheckResult[] = [
    checkNodeVersion(),
    checkSqliteBuiltin(),
    checkWritableDir("sqlite-dir-writable", dirname(config.SQLITE_PATH)),
    checkWritableDir("http-cache-dir-writable", config.HTTP_CACHE_DIR),
    checkSourceRegistry(),
    checkFredKey(config),
  ];
  const overall: DoctorReport["overall"] = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warn")
      ? "warn"
      : "ok";
  return { generatedAtMs: Date.now(), checks, overall };
}
