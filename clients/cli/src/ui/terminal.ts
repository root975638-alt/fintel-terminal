/**
 * Minimal, dependency-free ANSI styling + terminal capability detection.
 * Deliberately hand-rolled (no chalk/kleur) to keep the CLI's dependency graph
 * tiny and guaranteed to work everywhere Node runs, including Termux, with a
 * graceful no-color fallback for limited terminals / piped output (spec 6.17).
 */

const isTTY = process.stdout.isTTY === true;
const noColor = process.env.NO_COLOR !== undefined || process.env.TERM === "dumb";
export const colorEnabled = isTTY && !noColor;

function wrap(code: string, resetCode = "0"): (text: string) => string {
  return (text: string) => (colorEnabled ? `\u001b[${code}m${text}\u001b[${resetCode}m` : text);
}

export const style = {
  bold: wrap("1"),
  dim: wrap("2"),
  green: wrap("32"),
  red: wrap("31"),
  yellow: wrap("33"),
  cyan: wrap("36"),
  magenta: wrap("35"),
  gray: wrap("90"),
};

export function terminalWidth(): number {
  return process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : 80;
}

/** Renders a compact ASCII/Unicode sparkline for a numeric series — works in any terminal, no truecolor required. */
const SPARK_CHARS = "▁▂▃▄▅▆▇█";

export function sparkline(values: readonly number[]): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v) => {
      const idx = Math.min(SPARK_CHARS.length - 1, Math.floor(((v - min) / range) * (SPARK_CHARS.length - 1)));
      return SPARK_CHARS[idx];
    })
    .join("");
}

export function formatQuality(quality: string): string {
  switch (quality) {
    case "realtime":
      return style.green(quality);
    case "delayed":
      return style.yellow(quality);
    case "eod":
      return style.cyan(quality);
    case "stale":
      return style.red(quality);
    case "estimated":
      return style.magenta(quality);
    default:
      return style.gray(quality);
  }
}

export function formatDirection(direction: string): string {
  switch (direction) {
    case "long":
      return style.green(direction.toUpperCase());
    case "short":
      return style.red(direction.toUpperCase());
    default:
      return style.gray(direction.toUpperCase());
  }
}
