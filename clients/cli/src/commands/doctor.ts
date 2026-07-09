import { loadConfig } from "@fintel/config";
import { runDoctorChecks } from "@fintel/core";
import { style } from "../ui/terminal.js";

export interface DoctorOptions {
  readonly json?: boolean;
}

export async function runDoctorCommand(opts: DoctorOptions): Promise<void> {
  const config = loadConfig();
  const report = runDoctorChecks(config);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    if (report.overall === "fail") process.exitCode = 1;
    return;
  }

  console.log(style.bold("FINTEL-TERMINAL environment check\n"));
  for (const check of report.checks) {
    const icon = check.status === "ok" ? style.green("✓") : check.status === "warn" ? style.yellow("!") : style.red("✗");
    console.log(`  ${icon} ${style.bold(check.name)}: ${check.message}`);
  }
  console.log(
    `\nOverall: ${
      report.overall === "ok" ? style.green("OK") : report.overall === "warn" ? style.yellow("WARN") : style.red("FAIL")
    }`,
  );
  if (report.overall === "fail") process.exitCode = 1;
}
