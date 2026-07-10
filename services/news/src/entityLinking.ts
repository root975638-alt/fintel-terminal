/**
 * Entity/ticker linking — deterministic string matching against a known
 * instrument catalogue, NOT NLP-based Named Entity Recognition. Explicitly a
 * heuristic: may miss instruments referred to by nicknames/abbreviations not
 * in the catalogue, and may false-positive on short symbols that collide with
 * common English words (mitigated by requiring word-boundary + a minimum
 * symbol length, but not eliminated).
 */
import type { Instrument } from "@fintel/domain";

export interface EntityLinkResult {
  readonly relatedInstrumentIds: readonly string[];
  readonly honestyLabel: "EXPERIMENTAL";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Links a headline+summary to zero or more instruments from `catalogue` by
 * matching the instrument's display name (as a substring, case-insensitive)
 * or its ticker symbol (as a whole-word match, to avoid matching e.g. "A" or
 * "IT" as a ticker inside ordinary words).
 */
export function linkEntities(text: string, catalogue: readonly Instrument[]): EntityLinkResult {
  const lowerText = text.toLowerCase();
  const matched = new Set<string>();

  for (const instrument of catalogue) {
    const nameLower = instrument.displayName.toLowerCase();
    // Strip common corporate suffixes for a more forgiving name match (e.g. "Apple Inc." -> "apple").
    const shortName = nameLower
      .replace(/\b(inc|incorporated|corp|corporation|ltd|limited|plc|co)\.?\b/g, "")
      .replace(/[.,]+$/, "")
      .trim();

    const nameMatches = shortName.length >= 3 && lowerText.includes(shortName);
    const symbolPattern = new RegExp(`\\b${escapeRegex(instrument.symbol.toLowerCase())}\\b`);
    const symbolMatches = instrument.symbol.length >= 3 && symbolPattern.test(lowerText);

    if (nameMatches || symbolMatches) {
      matched.add(instrument.instrumentId);
    }
  }

  return { relatedInstrumentIds: [...matched], honestyLabel: "EXPERIMENTAL" };
}
