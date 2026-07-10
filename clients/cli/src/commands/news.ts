import { createFintelCore } from "@fintel/core";
import { style, formatQuality } from "../ui/terminal.js";

export interface NewsOptions {
  readonly symbol?: string;
  readonly limit?: string;
  readonly json?: boolean;
}

export async function runNewsCommand(opts: NewsOptions): Promise<void> {
  const core = createFintelCore();
  try {
    const limit = opts.limit ? Number(opts.limit) : 20;
    const { feedErrors } = await core.news.fetchAndEnrich();
    for (const err of feedErrors) {
      console.error(style.yellow(`  WARNING: feed "${err.sourceId}" failed and was skipped: ${err.message}`));
    }
    const items = opts.symbol
      ? await core.news.forInstrument(opts.symbol.toUpperCase(), limit)
      : await core.news.recent(limit);

    if (opts.json) {
      console.log(JSON.stringify(items, null, 2));
      return;
    }

    if (items.length === 0) {
      console.log(style.dim("No news items found."));
      return;
    }

    for (const item of items) {
      const sentimentStyled =
        item.sentiment === "very-positive" || item.sentiment === "positive"
          ? style.green(item.sentiment)
          : item.sentiment === "very-negative" || item.sentiment === "negative"
            ? style.red(item.sentiment)
            : style.gray(item.sentiment ?? "unscored");
      console.log(`${style.bold(item.headline)}`);
      console.log(
        `  ${new Date(item.publishedAtMs).toISOString()}  ${item.sourceName}  sentiment=${sentimentStyled}  ` +
          `quality=${formatQuality(item.provenance.quality)}`,
      );
      if (item.relatedInstrumentIds.length > 0) {
        console.log(style.dim(`  Related: ${item.relatedInstrumentIds.join(", ")}`));
      }
      console.log(style.dim(`  ${item.url}\n`));
    }
    console.log(
      style.dim(
        "Sentiment/entity linking are [EXPERIMENTAL] rule-based heuristics, not an NLP model — treat with skepticism.",
      ),
    );
  } finally {
    core.close();
  }
}
