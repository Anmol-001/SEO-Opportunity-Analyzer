import type { RobotsPolicy, RobotsRule } from "./types.ts";

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export const MAX_ROBOTS_RULES = 128;
export const MAX_ROBOTS_RULE_LENGTH = 512;
export const MAX_ROBOTS_WILDCARDS = 16;
export const MAX_ROBOTS_TARGET_LENGTH = 2_048;
const MAX_ROBOTS_GROUPS = 64;
const MAX_ROBOTS_AGENTS_PER_GROUP = 16;
const MAX_ROBOTS_LINES = 2_000;

export function emptyRobotsPolicy(): RobotsPolicy {
  return {
    fetched: false,
    finalUrl: null,
    rules: [],
    sitemaps: [],
    status: null,
  };
}

export function parseRobotsTxt(body: string): Pick<RobotsPolicy, "rules" | "sitemaps"> {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let currentGroup: RobotsGroup | null = null;
  let groupHasRules = false;

  for (const rawLine of body.split(/\r?\n/).slice(0, MAX_ROBOTS_LINES)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "sitemap" && value) {
      if (value.length > MAX_ROBOTS_TARGET_LENGTH) continue;
      try {
        const url = new URL(value);
        if (url.protocol === "http:" || url.protocol === "https:") {
          sitemaps.push(url.toString());
        }
      } catch {
        // Ignore malformed sitemap declarations.
      }
      continue;
    }

    if (field === "user-agent") {
      if (!currentGroup || groupHasRules) {
        if (groups.length >= MAX_ROBOTS_GROUPS) {
          currentGroup = null;
          continue;
        }
        currentGroup = { agents: [], rules: [] };
        groups.push(currentGroup);
        groupHasRules = false;
      }
      if (
        value &&
        value.length <= 128 &&
        currentGroup.agents.length < MAX_ROBOTS_AGENTS_PER_GROUP
      ) {
        currentGroup.agents.push(value.toLowerCase());
      }
      continue;
    }

    if ((field === "allow" || field === "disallow") && currentGroup) {
      groupHasRules = true;
      if (!value && field === "disallow") continue;
      const path = value || "/";
      const wildcardCount = [...path].filter((character) => character === "*").length;
      if (
        currentGroup.rules.length >= MAX_ROBOTS_RULES ||
        path.length > MAX_ROBOTS_RULE_LENGTH ||
        wildcardCount > MAX_ROBOTS_WILDCARDS
      ) {
        continue;
      }
      currentGroup.rules.push({ directive: field, path });
    }
  }

  const matchingGroups = groups.filter((group) =>
    group.agents.some(
      (agent) => agent === "*" || agent.includes("searchlightbot") || agent === "searchlight",
    ),
  );

  return {
    rules: matchingGroups
      .flatMap((group) => group.rules)
      .slice(0, MAX_ROBOTS_RULES),
    sitemaps: [...new Set(sitemaps)].slice(0, 10),
  };
}

function collapseWildcards(value: string) {
  let result = "";
  let previousWasWildcard = false;
  for (const character of value) {
    if (character === "*") {
      if (!previousWasWildcard) result += character;
      previousWasWildcard = true;
    } else {
      result += character;
      previousWasWildcard = false;
    }
  }
  return result;
}

function ruleMatches(path: string, target: string) {
  const anchored = path.endsWith("$");
  const rawPattern = anchored ? path.slice(0, -1) : path;
  const pattern = collapseWildcards(rawPattern);
  if (!pattern.includes("*")) {
    return anchored ? target === pattern : target.startsWith(pattern);
  }

  const startsWithWildcard = pattern.startsWith("*");
  const endsWithWildcard = pattern.endsWith("*");
  const segments = pattern.split("*").filter(Boolean);
  let position = 0;
  let nextSegment = 0;

  if (!startsWithWildcard) {
    const first = segments[0] ?? "";
    if (!target.startsWith(first)) return false;
    position = first.length;
    nextSegment = 1;
  }

  const lastIndex = segments.length - 1;
  const hasAnchoredEndSegment = anchored && !endsWithWildcard && lastIndex >= 0;
  const searchEnd = hasAnchoredEndSegment ? lastIndex : segments.length;
  for (let index = nextSegment; index < searchEnd; index += 1) {
    const matchIndex = target.indexOf(segments[index], position);
    if (matchIndex === -1) return false;
    position = matchIndex + segments[index].length;
  }

  if (hasAnchoredEndSegment) {
    const last = segments[lastIndex];
    const endStart = target.length - last.length;
    return endStart >= position && target.endsWith(last);
  }

  return true;
}

function ruleSpecificity(path: string) {
  let length = 0;
  for (const character of path) {
    if (character !== "*" && character !== "$") length += 1;
  }
  return length;
}

export function isPathAllowedByRobots(url: URL, rules: RobotsRule[]) {
  const target = `${url.pathname}${url.search}`;
  if (target.length > MAX_ROBOTS_TARGET_LENGTH) return false;

  let winningRule: RobotsRule | null = null;
  let winningSpecificity = -1;
  for (const rule of rules.slice(0, MAX_ROBOTS_RULES)) {
    const wildcardCount = [...rule.path].filter((character) => character === "*").length;
    if (
      rule.path.length > MAX_ROBOTS_RULE_LENGTH ||
      wildcardCount > MAX_ROBOTS_WILDCARDS ||
      !ruleMatches(rule.path, target)
    ) {
      continue;
    }

    const specificity = ruleSpecificity(rule.path);
    if (
      specificity > winningSpecificity ||
      (specificity === winningSpecificity && rule.directive === "allow")
    ) {
      winningRule = rule;
      winningSpecificity = specificity;
    }
  }

  return winningRule?.directive !== "disallow";
}
