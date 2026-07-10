/**
 * Rule-based (lexicon) sentiment scorer — [EXPERIMENTAL] heuristic, explicitly
 * NOT an NLP/ML model. Financial news language is nuanced (e.g. "beats
 * expectations" vs "beats down"); a word-list approach will misclassify
 * sarcasm, negated statements it doesn't catch, and domain-specific idioms.
 * This is intentionally simple and auditable rather than a black-box model —
 * every score can be traced back to which words matched.
 */
import type { NewsSentiment } from "@fintel/domain";

const POSITIVE_WORDS = [
  "surge", "surges", "surged", "soar", "soars", "soared", "rally", "rallies", "rallied",
  "beat", "beats", "outperform", "outperforms", "upgrade", "upgraded", "growth", "grows", "grew",
  "profit", "profits", "profitable", "gain", "gains", "gained", "record high", "boost", "boosts", "boosted",
  "strong", "stronger", "bullish", "optimistic", "expand", "expands", "expanded", "expansion",
  "win", "wins", "won", "successful", "success", "breakthrough", "milestone", "recovery", "recovers", "recovered",
];

const NEGATIVE_WORDS = [
  "plunge", "plunges", "plunged", "crash", "crashes", "crashed", "slump", "slumps", "slumped",
  "miss", "misses", "missed", "downgrade", "downgraded", "decline", "declines", "declined",
  "loss", "losses", "lawsuit", "lawsuits", "recall", "recalls", "recalled", "bankrupt", "bankruptcy",
  "weak", "weaker", "bearish", "pessimistic", "shrink", "shrinks", "shrank", "contraction",
  "layoff", "layoffs", "cut", "cuts", "fraud", "scandal", "investigation", "probe", "warns", "warning",
  "plummet", "plummets", "plummeted", "tumble", "tumbles", "tumbled",
];

const NEGATION_WORDS = new Set(["not", "no", "never", "without", "hardly", "barely", "n't"]);
const NEGATION_WINDOW = 3; // a negation flips sentiment for words within this many tokens after it

export interface SentimentScoreResult {
  readonly score: number; // in [-1, 1]
  readonly sentiment: NewsSentiment;
  readonly matchedPositive: readonly string[];
  readonly matchedNegative: readonly string[];
  readonly honestyLabel: "EXPERIMENTAL";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function scoreToSentiment(score: number): NewsSentiment {
  if (score <= -0.5) return "very-negative";
  if (score < 0) return "negative";
  if (score === 0) return "neutral";
  if (score < 0.5) return "positive";
  return "very-positive";
}

/**
 * Scores a headline/summary text for sentiment. Negation handling: if a
 * negation word appears within `NEGATION_WINDOW` tokens before a sentiment
 * word, that word's polarity is flipped (e.g. "not profitable" counts as
 * negative, not positive) — this is a simple heuristic, not full NLP
 * dependency parsing, and will miss more complex negation patterns.
 */
export function scoreSentiment(text: string): SentimentScoreResult {
  const tokens = tokenize(text);
  const matchedPositive: string[] = [];
  const matchedNegative: string[] = [];
  let rawScore = 0;

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i]!;
    const isPositive = POSITIVE_WORDS.includes(word);
    const isNegative = NEGATIVE_WORDS.includes(word);
    if (!isPositive && !isNegative) continue;

    const windowStart = Math.max(0, i - NEGATION_WINDOW);
    const negated = tokens.slice(windowStart, i).some((t) => NEGATION_WORDS.has(t));

    if (isPositive) {
      if (negated) {
        rawScore -= 1;
        matchedNegative.push(`not:${word}`);
      } else {
        rawScore += 1;
        matchedPositive.push(word);
      }
    } else {
      if (negated) {
        rawScore += 1;
        matchedPositive.push(`not:${word}`);
      } else {
        rawScore -= 1;
        matchedNegative.push(word);
      }
    }
  }

  const totalMatches = matchedPositive.length + matchedNegative.length;
  const normalizedScore = totalMatches > 0 ? Math.max(-1, Math.min(1, rawScore / totalMatches)) : 0;

  return {
    score: normalizedScore,
    sentiment: scoreToSentiment(normalizedScore),
    matchedPositive,
    matchedNegative,
    honestyLabel: "EXPERIMENTAL",
  };
}
