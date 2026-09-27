// A failed scheduled run turns one job red, and a red scheduled job is easy to
// miss. A tracking issue stays open in the repository until the guide works
// again, then closes itself. There is at most one open issue per target.

import { renderFailure } from "./report.js";
import type { TargetResult } from "./run.js";

export interface Issue {
  number: number;
  body: string | null;
}

export type Decision =
  | { action: "open"; title: string; body: string }
  | { action: "update"; number: number; body: string }
  | { action: "close"; number: number; comment: string }
  | { action: "none" };

/** Hidden in the issue body, so the next run finds the issue for the same target. */
export const marker = (target: string) => `<!-- install-sentinel target=${target} -->`;

export function decide(result: TargetResult, open: Issue[], runUrl: string): Decision {
  // A target that is expected to stop, for a known reason, would keep one issue open for nothing.
  if (!result.target.openIssues) return { action: "none" };
  const name = result.target.name;
  const existing = open.find((i) => i.body?.includes(marker(name)));

  if (result.passed) {
    if (!existing) return { action: "none" };
    return { action: "close", number: existing.number, comment: `The guide for **${name}** passes again in [this run](${runUrl}).` };
  }

  const body = [marker(name), `The documented install path for **${name}** failed in [this run](${runUrl}).`, "", ...renderFailure(result)].join("\n");
  if (existing) return { action: "update", number: existing.number, body };
  return { action: "open", title: `Install guide fails: ${name}`, body };
}

/** Opens, updates, or closes one issue per target in `repository`, through the GitHub REST API. */
export async function syncIssues(
  results: TargetResult[],
  options: { token: string; repository: string; runUrl: string; apiUrl?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<Decision[]> {
  const call = async (method: string, route: string, body?: object) => {
    const response = await fetchImpl(`${options.apiUrl ?? "https://api.github.com"}/repos/${options.repository}${route}`, {
      method,
      headers: { authorization: `Bearer ${options.token}`, accept: "application/vnd.github+json" },
      body: body && JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`GitHub API ${method} ${route} returned HTTP ${response.status}.`);
    return response.json();
  };

  // One page of open issues is enough: each run has only a few targets to look for.
  const open = (await call("GET", "/issues?state=open&per_page=100")) as Issue[];
  const decisions = results.map((r) => decide(r, open, options.runUrl));
  for (const d of decisions) {
    if (d.action === "open") await call("POST", "/issues", { title: d.title, body: d.body });
    if (d.action === "update") await call("PATCH", `/issues/${d.number}`, { body: d.body });
    if (d.action === "close") {
      await call("POST", `/issues/${d.number}/comments`, { body: d.comment });
      await call("PATCH", `/issues/${d.number}`, { state: "closed", state_reason: "completed" });
    }
  }
  return decisions;
}
