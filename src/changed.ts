// On a pull request, checking only the pages it changed keeps every finding about
// the author's own edits, and keeps the check fast on a large docs site.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Files that differ between `ref` and HEAD in the repository at `cwd`, as absolute paths. */
export function changedFiles(ref: string, cwd = process.cwd()): string[] {
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const root = git("rev-parse", "--show-toplevel");
  return git("diff", "--name-only", ref, "HEAD")
    .split("\n")
    .filter(Boolean)
    .map((f) => path.join(root, f));
}

/** Keeps only the files a change touched. */
export function onlyChanged(files: string[], changed: string[]): string[] {
  const touched = new Set(changed.map((f) => path.resolve(f)));
  return files.filter((f) => touched.has(path.resolve(f)));
}

/** The base commit of the pull request that started this workflow run. Undefined for any other event. */
export function pullRequestBase(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.GITHUB_EVENT_NAME !== "pull_request" || !env.GITHUB_EVENT_PATH) return undefined;
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  return event.pull_request?.base?.sha;
}
