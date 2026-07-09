/**
 * Minimal but correct robots.txt parser/checker.
 *
 * Supports the subset of the robots.txt spec that matters for compliance checks:
 * User-agent groups, Allow/Disallow rules (longest-match-wins per Google's de-facto
 * standard), and Crawl-delay. Does not attempt full RFC 9309 edge cases (wildcards in
 * paths are supported at a basic level: `*` and trailing `$`).
 */

export interface RobotsRuleSet {
  readonly disallow: readonly string[];
  readonly allow: readonly string[];
  readonly crawlDelaySeconds?: number;
}

export interface ParsedRobots {
  readonly groups: ReadonlyMap<string, RobotsRuleSet>; // key: lowercased user-agent, "*" = default
}

export function parseRobotsTxt(text: string): ParsedRobots {
  const groups = new Map<string, { disallow: string[]; allow: string[]; crawlDelaySeconds?: number }>();
  let currentAgents: string[] = [];
  let sawRuleSinceAgent = false;

  const ensureGroup = (agent: string) => {
    const key = agent.toLowerCase();
    if (!groups.has(key)) groups.set(key, { disallow: [], allow: [] });
    return groups.get(key)!;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const sepIdx = line.indexOf(":");
    if (sepIdx === -1) continue;
    const field = line.slice(0, sepIdx).trim().toLowerCase();
    const value = line.slice(sepIdx + 1).trim();

    if (field === "user-agent") {
      if (sawRuleSinceAgent) {
        // A new user-agent line after rules means a fresh group starts.
        currentAgents = [];
        sawRuleSinceAgent = false;
      }
      currentAgents.push(value);
      ensureGroup(value);
      continue;
    }
    if (currentAgents.length === 0) continue;
    if (field === "disallow") {
      sawRuleSinceAgent = true;
      if (value !== "") for (const a of currentAgents) ensureGroup(a).disallow.push(value);
      continue;
    }
    if (field === "allow") {
      sawRuleSinceAgent = true;
      if (value !== "") for (const a of currentAgents) ensureGroup(a).allow.push(value);
      continue;
    }
    if (field === "crawl-delay") {
      sawRuleSinceAgent = true;
      const seconds = Number(value);
      if (Number.isFinite(seconds)) {
        for (const a of currentAgents) ensureGroup(a).crawlDelaySeconds = seconds;
      }
      continue;
    }
  }

  return { groups };
}

function patternToRegExp(pattern: string): RegExp {
  const anchoredEnd = pattern.endsWith("$");
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchoredEnd ? "$" : ""}`);
}

/**
 * Returns true if `path` is allowed for `userAgent` per the parsed robots rules.
 * Uses longest-matching-rule-wins semantics (the de-facto standard used by major
 * crawlers), falling back to the "*" group when no agent-specific group matches.
 */
export function isPathAllowed(robots: ParsedRobots, userAgent: string, path: string): boolean {
  const uaKey = userAgent.toLowerCase();
  const group =
    [...robots.groups.entries()].find(([key]) => uaKey.includes(key) && key !== "*")?.[1] ??
    robots.groups.get("*");
  if (!group) return true; // no applicable rules found => allowed by default

  let bestLen = -1;
  let bestAllowed = true;
  for (const rule of group.disallow) {
    if (rule === "") continue;
    if (patternToRegExp(rule).test(path) && rule.length > bestLen) {
      bestLen = rule.length;
      bestAllowed = false;
    }
  }
  for (const rule of group.allow) {
    if (rule === "") continue;
    if (patternToRegExp(rule).test(path) && rule.length > bestLen) {
      bestLen = rule.length;
      bestAllowed = true;
    }
  }
  return bestAllowed;
}

export function crawlDelaySeconds(robots: ParsedRobots, userAgent: string): number | undefined {
  const uaKey = userAgent.toLowerCase();
  const group =
    [...robots.groups.entries()].find(([key]) => uaKey.includes(key) && key !== "*")?.[1] ??
    robots.groups.get("*");
  return group?.crawlDelaySeconds;
}
