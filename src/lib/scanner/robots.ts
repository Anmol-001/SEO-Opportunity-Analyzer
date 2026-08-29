import type { RobotsPolicy, RobotsRule } from "./types.ts";

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

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

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "sitemap" && value) {
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
        currentGroup = { agents: [], rules: [] };
        groups.push(currentGroup);
        groupHasRules = false;
      }
      if (value) currentGroup.agents.push(value.toLowerCase());
      continue;
    }

    if ((field === "allow" || field === "disallow") && currentGroup) {
      groupHasRules = true;
      if (!value && field === "disallow") continue;
      currentGroup.rules.push({ directive: field, path: value || "/" });
    }
  }

  const matchingGroups = groups.filter((group) =>
    group.agents.some(
      (agent) => agent === "*" || agent.includes("searchlightbot") || agent === "searchlight",
    ),
  );

  return {
    rules: matchingGroups.flatMap((group) => group.rules),
    sitemaps: [...new Set(sitemaps)].slice(0, 10),
  };
}

function rulePattern(path: string) {
  const anchored = path.endsWith("$");
  const source = path
    .replace(/\$$/, "")
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`);
}

export function isPathAllowedByRobots(url: URL, rules: RobotsRule[]) {
  const target = `${url.pathname}${url.search}`;
  const matches = rules
    .filter((rule) => rulePattern(rule.path).test(target))
    .sort((a, b) => {
      const lengthDifference = b.path.replace(/[\*$]/g, "").length - a.path.replace(/[\*$]/g, "").length;
      if (lengthDifference !== 0) return lengthDifference;
      return a.directive === "allow" ? -1 : 1;
    });

  return matches[0]?.directive !== "disallow";
}
