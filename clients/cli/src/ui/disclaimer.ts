import { style } from "./terminal.js";

export const DISCLAIMER =
  "For informational/research/educational purposes only. Not financial advice. " +
  "Data is sourced from free public sources and may be delayed, incomplete, or inaccurate. " +
  "Markets involve risk of loss.";

export function printBanner(): void {
  console.error(style.dim(`FINTEL-TERMINAL v0.1.0 — ${DISCLAIMER}`));
}
