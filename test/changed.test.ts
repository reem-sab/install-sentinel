import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { changedFiles, onlyChanged, pullRequestBase } from "../src/changed.js";
import { validatePaths } from "../src/commands.js";

const fixtures = new URL("./fixtures/", import.meta.url).pathname;

describe("onlyChanged", () => {
  it("keeps only the files a change touched", () => {
    expect(onlyChanged(["/docs/a.md", "/docs/b.md", "/docs/c.mdx"], ["/docs/b.md", "/src/x.ts"])).toEqual(["/docs/b.md"]);
  });
});

describe("validatePaths with a changed list", () => {
  it("checks only matching files that changed", async () => {
    const changed = [path.join(fixtures, "tab-indent.md"), path.join(fixtures, "not-markdown.ts")];
    const { files } = await validatePaths([`${fixtures}*.md`], {}, changed);
    expect(files).toEqual([path.join(fixtures, "tab-indent.md")]);
  });
});

describe("changedFiles", () => {
  it("lists files that differ from a ref, as absolute paths", () => {
    const repo = mkdtempSync(path.join(os.tmpdir(), "sentinel-git-"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q");
    writeFileSync(path.join(repo, "old.md"), "old\n");
    git("add", "-A");
    git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    writeFileSync(path.join(repo, "new.md"), "new\n");
    git("add", "-A");
    git("commit", "-qm", "change");

    expect(changedFiles(base, repo).map((f) => path.basename(f))).toEqual(["new.md"]);
  });
});

describe("pullRequestBase", () => {
  it("reads the base commit from a pull_request event", () => {
    const event = path.join(mkdtempSync(path.join(os.tmpdir(), "sentinel-event-")), "event.json");
    writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: "abc123" } } }));
    expect(pullRequestBase({ GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: event })).toBe("abc123");
    expect(pullRequestBase({ GITHUB_EVENT_NAME: "push", GITHUB_EVENT_PATH: event })).toBeUndefined();
  });
});
