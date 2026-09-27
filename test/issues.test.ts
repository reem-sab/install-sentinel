import { describe, expect, it } from "vitest";
import { marker, syncIssues, type Issue } from "../src/issues.js";
import type { Target } from "../src/manifest.js";
import type { TargetResult } from "../src/run.js";

const target = { name: "demo", guide: "docs/install.md", openIssues: true } as Target;

const result = (passed: boolean, openIssues = true): TargetResult => ({
  target: { ...target, openIssues },
  passed,
  prerequisites: { tools: [], missing: [] },
  environment: [],
  steps: [],
  assertions: [],
  teardown: [],
  failedStep: passed
    ? undefined
    : {
        status: "failed",
        step: { role: "step", block: { file: "docs/install.md", line: 12, lang: "bash", meta: [], headings: ["Install", "Deploy"], inDetails: false, content: "helm install" } },
        outcome: { exitCode: 1, timedOut: false, durationMs: 5, output: "Error: boom\n", outputTail: ["Error: boom"] },
      },
});

/** Stands in for the GitHub API: answers the list call with `open` and records every call. */
function mockApi(open: Issue[]) {
  const calls: { method: string; route: string; body?: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const route = url.replace("https://api.github.com/repos/owner/repo", "");
    calls.push({ method: init.method!, route, body: init.body ? JSON.parse(init.body as string) : undefined });
    return new Response(JSON.stringify(init.method === "GET" ? open : {}), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const sync = (results: TargetResult[], open: Issue[]) => {
  const api = mockApi(open);
  const done = syncIssues(results, { token: "t", repository: "owner/repo", runUrl: "https://run" }, api.fetchImpl);
  return done.then((decisions) => ({ decisions, writes: api.calls.filter((c) => c.method !== "GET") }));
};

describe("syncIssues", () => {
  it("opens an issue with the failing heading, file, line, and output", async () => {
    const { writes } = await sync([result(false)], []);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ method: "POST", route: "/issues", body: { title: "demo: run stopped at Install > Deploy" } });
    const body = writes[0].body!.body as string;
    expect(body).toContain(marker("demo"));
    expect(body).toContain("- Heading: Install > Deploy");
    expect(body).toContain("- File: `docs/install.md`");
    expect(body).toContain("- Line: 12");
    expect(body).toContain("- Exit code: 1");
    expect(body).toContain("Error: boom");
    // Facts only: no judgment words in the title or the body.
    expect(`${writes[0].body!.title}\n${body}`).not.toMatch(/bug|broke|wrong|missing|fail/i);
  });

  it("updates the open issue for the same target instead of opening another", async () => {
    const { writes } = await sync([result(false)], [{ number: 7, body: `${marker("demo")}\nold failure` }]);
    expect(writes).toEqual([expect.objectContaining({ method: "PATCH", route: "/issues/7" })]);
    expect(writes[0].body!.body).toContain("Error: boom");
  });

  it("comments on and closes the open issue when the target passes again", async () => {
    const { writes } = await sync([result(true)], [{ number: 7, body: marker("demo") }]);
    expect(writes).toEqual([
      expect.objectContaining({ method: "POST", route: "/issues/7/comments" }),
      expect.objectContaining({ method: "PATCH", route: "/issues/7", body: { state: "closed", state_reason: "completed" } }),
    ]);
  });

  it("leaves a target that opts out alone, even when it fails", async () => {
    const { decisions, writes } = await sync([result(false, false)], [{ number: 7, body: marker("demo") }]);
    expect(decisions).toEqual([{ action: "none" }]);
    expect(writes).toEqual([]);
  });

  it("does nothing for a passing target with no open issue, or an issue for another target", async () => {
    const { decisions, writes } = await sync([result(true)], [{ number: 3, body: marker("other") }]);
    expect(decisions).toEqual([{ action: "none" }]);
    expect(writes).toEqual([]);
  });
});
