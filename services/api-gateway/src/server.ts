#!/usr/bin/env node
/** Process entrypoint — wires packages/core into a listening HTTP server. */
import { createFintelCore } from "@fintel/core";
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const core = createFintelCore();
  const app = buildApp(core);

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    core.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ port: core.config.API_PORT, host: core.config.API_HOST });
    console.log(
      `FINTEL-TERMINAL API listening on http://${core.config.API_HOST}:${core.config.API_PORT} ` +
        `(NOT FINANCIAL ADVICE — research/educational use only; data sourced from free public sources ` +
        `and may be delayed, incomplete, or inaccurate)`,
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
