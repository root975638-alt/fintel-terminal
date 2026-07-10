/**
 * REST API Gateway — Fastify app exposing instruments/bars/signals with
 * provenance + freshness metadata in every response envelope (spec 6.20).
 * This module only builds the Fastify instance; services/api-gateway/src/server.ts
 * is the process entrypoint that wires it to a listening port.
 */
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import type { FintelCore } from "@fintel/core";
import { findSeedInstrument, runDoctorChecks, runExperiment, SEED_INSTRUMENTS, buildFundamentalSnapshot } from "@fintel/core";
import { Timeframe } from "@fintel/money-time";
import { worstQuality } from "@fintel/provenance";
import type {
  ApiEnvelope,
  ApiErrorBody,
  BarsResponse,
  DoctorReport,
  FreshnessSummary,
  InstrumentListResponse,
  InstrumentResponse,
  SignalsResponse,
} from "@fintel/types";

const API_VERSION = "0.1.0";

function envelope<T>(data: T, freshness: FreshnessSummary): ApiEnvelope<T> {
  return {
    meta: { requestId: randomUUID(), generatedAtMs: Date.now(), apiVersion: API_VERSION },
    freshness,
    data,
  };
}

function noFreshness(): FreshnessSummary {
  return { quality: "unknown", asOfMs: Date.now(), sourceIds: [] };
}

export function buildApp(core: FintelCore): FastifyInstance {
  const app = Fastify({ logger: core.config.LOG_LEVEL !== "info" });

  app.setErrorHandler((err, _req, reply) => {
    const body: ApiErrorBody = {
      meta: { requestId: randomUUID(), generatedAtMs: Date.now(), apiVersion: API_VERSION },
      error: { code: err.name || "INTERNAL_ERROR", message: err.message },
    };
    reply.status((err as { statusCode?: number }).statusCode ?? 500).send(body);
  });

  app.get("/health", async () => ({ status: "ok", generatedAtMs: Date.now() }));

  app.get("/doctor", async () => {
    const report: DoctorReport = runDoctorChecks(core.config);
    return report;
  });

  app.get("/instruments", async (): Promise<InstrumentListResponse> => {
    // Vertical-slice milestone: seed catalogue + anything persisted locally, deduped by id.
    const persisted = await core.persistence.instruments.list();
    const byId = new Map(SEED_INSTRUMENTS.map((i) => [i.instrumentId, i]));
    for (const p of persisted) byId.set(p.instrumentId, p);
    return envelope([...byId.values()], noFreshness());
  });

  app.get<{ Params: { instrumentId: string } }>(
    "/instruments/:instrumentId",
    async (req, reply): Promise<InstrumentResponse | void> => {
      const { instrumentId } = req.params;
      const persisted = await core.persistence.instruments.findById(instrumentId);
      const instrument = persisted ?? findSeedInstrument(instrumentId);
      if (!instrument) {
        reply.status(404);
        return reply.send({
          meta: { requestId: randomUUID(), generatedAtMs: Date.now(), apiVersion: API_VERSION },
          error: { code: "NOT_FOUND", message: `Instrument "${instrumentId}" not found.` },
        } satisfies ApiErrorBody);
      }
      return envelope(instrument, noFreshness());
    },
  );

  app.get<{ Params: { instrumentId: string }; Querystring: { timeframe?: string; fromMs?: string; toMs?: string } }>(
    "/instruments/:instrumentId/bars",
    async (req, reply): Promise<BarsResponse | void> => {
      const { instrumentId } = req.params;
      const instrument = (await core.persistence.instruments.findById(instrumentId)) ?? findSeedInstrument(instrumentId);
      if (!instrument) {
        reply.status(404);
        return reply.send({
          meta: { requestId: randomUUID(), generatedAtMs: Date.now(), apiVersion: API_VERSION },
          error: { code: "NOT_FOUND", message: `Instrument "${instrumentId}" not found.` },
        } satisfies ApiErrorBody);
      }
      await core.marketData.ensureInstrument(instrument);
      const timeframe = (req.query.timeframe as Timeframe) ?? Timeframe.D1;
      const fromMs = req.query.fromMs ? Number(req.query.fromMs) : undefined;
      const toMs = req.query.toMs ? Number(req.query.toMs) : undefined;

      const bars = await core.marketData.getBars(instrument, timeframe, { fromMs, toMs });
      const freshness: FreshnessSummary = {
        quality: worstQuality(bars.map((b) => b.provenance.quality)),
        asOfMs: bars.length > 0 ? Math.max(...bars.map((b) => b.provenance.asOfMs)) : Date.now(),
        sourceIds: [...new Set(bars.map((b) => b.provenance.source.sourceId))],
      };
      return envelope(bars, freshness);
    },
  );

  app.get<{ Params: { instrumentId: string }; Querystring: { timeframe?: string } }>(
    "/instruments/:instrumentId/signals",
    async (req, reply): Promise<SignalsResponse | void> => {
      const { instrumentId } = req.params;
      const instrument = (await core.persistence.instruments.findById(instrumentId)) ?? findSeedInstrument(instrumentId);
      if (!instrument) {
        reply.status(404);
        return reply.send({
          meta: { requestId: randomUUID(), generatedAtMs: Date.now(), apiVersion: API_VERSION },
          error: { code: "NOT_FOUND", message: `Instrument "${instrumentId}" not found.` },
        } satisfies ApiErrorBody);
      }
      await core.marketData.ensureInstrument(instrument);
      const timeframe = (req.query.timeframe as Timeframe) ?? Timeframe.D1;
      const bars = await core.marketData.getBars(instrument, timeframe);
      const signals = core.signals.evaluateAll({ instrumentId: instrument.instrumentId, bars });
      for (const s of signals) await core.persistence.signals.insert(s);

      const freshness: FreshnessSummary = {
        quality: worstQuality(bars.map((b) => b.provenance.quality)),
        asOfMs: bars.length > 0 ? Math.max(...bars.map((b) => b.provenance.asOfMs)) : Date.now(),
        sourceIds: [...new Set(bars.map((b) => b.provenance.source.sourceId))],
      };
      return envelope(signals, freshness);
    },
  );

  app.get<{ Params: { instrumentId: string }; Querystring: { timeframe?: string; strategy?: string } }>(
    "/instruments/:instrumentId/backtest",
    async (req, reply) => {
      const { instrumentId } = req.params;
      const instrument = (await core.persistence.instruments.findById(instrumentId)) ?? findSeedInstrument(instrumentId);
      if (!instrument) {
        reply.status(404);
        return reply.send({
          meta: { requestId: randomUUID(), generatedAtMs: Date.now(), apiVersion: API_VERSION },
          error: { code: "NOT_FOUND", message: `Instrument "${instrumentId}" not found.` },
        } satisfies ApiErrorBody);
      }
      await core.marketData.ensureInstrument(instrument);
      const timeframe = (req.query.timeframe as Timeframe) ?? Timeframe.D1;
      const bars = await core.marketData.getBars(instrument, timeframe);

      const strategies = core.signals.listStrategies();
      const strategy = req.query.strategy ? strategies.find((s) => s.strategyId === req.query.strategy) : strategies[0];
      if (!strategy) {
        reply.status(400);
        return reply.send({
          meta: { requestId: randomUUID(), generatedAtMs: Date.now(), apiVersion: API_VERSION },
          error: {
            code: "UNKNOWN_STRATEGY",
            message: `Unknown strategy "${req.query.strategy}". Available: ${strategies.map((s) => s.strategyId).join(", ")}`,
          },
        } satisfies ApiErrorBody);
      }

      const { runId, report, decision } = await runExperiment({
        instrumentId: instrument.instrumentId,
        bars,
        strategy,
        persistence: core.persistence,
      });

      const freshness: FreshnessSummary = {
        quality: worstQuality(bars.map((b) => b.provenance.quality)),
        asOfMs: bars.length > 0 ? Math.max(...bars.map((b) => b.provenance.asOfMs)) : Date.now(),
        sourceIds: [...new Set(bars.map((b) => b.provenance.source.sourceId))],
      };
      return envelope({ runId, report, decision }, freshness);
    },
  );

  app.get<{ Params: { instrumentId: string } }>("/instruments/:instrumentId/fundamentals", async (req, reply) => {
    const { instrumentId } = req.params;
    try {
      const snapshot = await buildFundamentalSnapshot(instrumentId, core.acquisition.secEdgar);
      return envelope(snapshot, {
        quality: "delayed",
        asOfMs: Date.now(),
        sourceIds: ["sec-edgar-api"],
      });
    } catch (err) {
      reply.status(400);
      return reply.send({
        meta: { requestId: randomUUID(), generatedAtMs: Date.now(), apiVersion: API_VERSION },
        error: { code: "FUNDAMENTALS_UNAVAILABLE", message: (err as Error).message },
      } satisfies ApiErrorBody);
    }
  });

  app.get<{ Querystring: { symbol?: string; limit?: string } }>("/news", async (req) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const { feedErrors } = await core.news.fetchAndEnrich();
    const items = req.query.symbol
      ? await core.news.forInstrument(req.query.symbol.toUpperCase(), limit)
      : await core.news.recent(limit);

    const freshness: FreshnessSummary = {
      quality: worstQuality(items.map((i) => i.provenance.quality)),
      asOfMs: items.length > 0 ? Math.max(...items.map((i) => i.provenance.asOfMs)) : Date.now(),
      sourceIds: [...new Set(items.map((i) => i.provenance.source.sourceId))],
    };
    return envelope({ items, feedErrors }, freshness);
  });

  app.get("/macro", async (_req, reply) => {
    if (!core.config.FRED_API_KEY) {
      reply.status(503);
      return reply.send({
        meta: { requestId: randomUUID(), generatedAtMs: Date.now(), apiVersion: API_VERSION },
        error: {
          code: "FRED_API_KEY_MISSING",
          message:
            "FRED_API_KEY is not configured — macro data is unavailable (explicit degraded mode, not fabricated). " +
            "Register a free key at https://fred.stlouisfed.org/docs/api/api_key.html.",
        },
      } satisfies ApiErrorBody);
    }
    const snapshot = await core.macro.computeSnapshot();
    return envelope(snapshot, { quality: "delayed", asOfMs: snapshot.fetchedAtMs, sourceIds: ["fred-api"] });
  });

  return app;
}
