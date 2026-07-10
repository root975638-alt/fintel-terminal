/**
 * Backtest run repository — stores EVERY backtest run, including negative/
 * failed results, never just winners (spec: "experiment registry (INCLUDING
 * negatives)"). This is the audit trail that lets `quant-research`'s
 * promotion logic be checked/reproduced later, and prevents silent survivorship
 * bias in which strategies get remembered.
 */
import type { DatabaseSync } from "node:sqlite";

export interface BacktestRunRecord {
  readonly runId: string;
  readonly instrumentId: string;
  readonly strategyId: string;
  readonly runAtMs: number;
  readonly inSampleFraction: number;
  readonly initialCapital: number;
  readonly costModelJson: string;
  readonly isBarCount: number;
  readonly isTradeCount: number;
  readonly isTotalReturnPct: number;
  readonly isSharpeRatio: number | null;
  readonly isMaxDrawdownPct: number;
  readonly oosBarCount: number;
  readonly oosTradeCount: number;
  readonly oosTotalReturnPct: number;
  readonly oosSharpeRatio: number | null;
  readonly oosMaxDrawdownPct: number;
  readonly oosHoldsUp: boolean | null;
  readonly promotedLabel: string;
  readonly fullReportJson: string;
}

export interface BacktestRunRepository {
  insert(record: BacktestRunRecord): Promise<void>;
  listForStrategy(strategyId: string, limit: number): Promise<readonly BacktestRunRecord[]>;
  listForInstrument(instrumentId: string, limit: number): Promise<readonly BacktestRunRecord[]>;
  listAll(limit: number): Promise<readonly BacktestRunRecord[]>;
}

export class SqliteBacktestRunRepository implements BacktestRunRepository {
  constructor(private readonly db: DatabaseSync) {}

  async insert(record: BacktestRunRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO backtest_runs (
           run_id, instrument_id, strategy_id, run_at_ms, in_sample_fraction, initial_capital, cost_model_json,
           is_bar_count, is_trade_count, is_total_return_pct, is_sharpe_ratio, is_max_drawdown_pct,
           oos_bar_count, oos_trade_count, oos_total_return_pct, oos_sharpe_ratio, oos_max_drawdown_pct,
           oos_holds_up, promoted_label, full_report_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.runId,
        record.instrumentId,
        record.strategyId,
        record.runAtMs,
        record.inSampleFraction,
        record.initialCapital,
        record.costModelJson,
        record.isBarCount,
        record.isTradeCount,
        record.isTotalReturnPct,
        record.isSharpeRatio,
        record.isMaxDrawdownPct,
        record.oosBarCount,
        record.oosTradeCount,
        record.oosTotalReturnPct,
        record.oosSharpeRatio,
        record.oosMaxDrawdownPct,
        record.oosHoldsUp === null ? null : record.oosHoldsUp ? 1 : 0,
        record.promotedLabel,
        record.fullReportJson,
      );
  }

  async listForStrategy(strategyId: string, limit: number): Promise<readonly BacktestRunRecord[]> {
    const rows = this.db
      .prepare("SELECT * FROM backtest_runs WHERE strategy_id = ? ORDER BY run_at_ms DESC LIMIT ?")
      .all(strategyId, limit) as Record<string, unknown>[];
    return rows.map(rowToRecord);
  }

  async listForInstrument(instrumentId: string, limit: number): Promise<readonly BacktestRunRecord[]> {
    const rows = this.db
      .prepare("SELECT * FROM backtest_runs WHERE instrument_id = ? ORDER BY run_at_ms DESC LIMIT ?")
      .all(instrumentId, limit) as Record<string, unknown>[];
    return rows.map(rowToRecord);
  }

  async listAll(limit: number): Promise<readonly BacktestRunRecord[]> {
    const rows = this.db.prepare("SELECT * FROM backtest_runs ORDER BY run_at_ms DESC LIMIT ?").all(limit) as Record<
      string,
      unknown
    >[];
    return rows.map(rowToRecord);
  }
}

function rowToRecord(row: Record<string, unknown>): BacktestRunRecord {
  return {
    runId: String(row.run_id),
    instrumentId: String(row.instrument_id),
    strategyId: String(row.strategy_id),
    runAtMs: Number(row.run_at_ms),
    inSampleFraction: Number(row.in_sample_fraction),
    initialCapital: Number(row.initial_capital),
    costModelJson: String(row.cost_model_json),
    isBarCount: Number(row.is_bar_count),
    isTradeCount: Number(row.is_trade_count),
    isTotalReturnPct: Number(row.is_total_return_pct),
    isSharpeRatio: row.is_sharpe_ratio === null ? null : Number(row.is_sharpe_ratio),
    isMaxDrawdownPct: Number(row.is_max_drawdown_pct),
    oosBarCount: Number(row.oos_bar_count),
    oosTradeCount: Number(row.oos_trade_count),
    oosTotalReturnPct: Number(row.oos_total_return_pct),
    oosSharpeRatio: row.oos_sharpe_ratio === null ? null : Number(row.oos_sharpe_ratio),
    oosMaxDrawdownPct: Number(row.oos_max_drawdown_pct),
    oosHoldsUp: row.oos_holds_up === null ? null : Number(row.oos_holds_up) === 1,
    promotedLabel: String(row.promoted_label),
    fullReportJson: String(row.full_report_json),
  };
}
