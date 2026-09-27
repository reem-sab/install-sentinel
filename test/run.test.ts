import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Target } from "../src/manifest.js";
import { runTarget } from "../src/run.js";
import { ShellSession, toCommands } from "../src/session.js";

const guide = new URL("./fixtures/session-guide.md", import.meta.url).pathname;

const target = (overrides: Partial<Target> = {}): Target => ({
  name: "fixture", guide, sections: [], teardown: ["Clean up"], skip: [], runDetails: false,
  env: {}, substitutions: {}, stepTimeoutMinutes: 1, assertions: [], openIssues: true, ...overrides,
});

describe("ShellSession", () => {
  it("carries the directory and exports from one step to the next, like one terminal", async () => {
    const s = new ShellSession();
    await s.run("mkdir -p a/b && cd a/b && export COLOR=teal", { timeoutMs: 5000 });
    const next = await s.run('echo "$COLOR in $(basename "$PWD")"', { timeoutMs: 5000 });
    expect(next.outputTail).toEqual(["teal in b"]);
  });

  it("stops a step that runs past its timeout", async () => {
    const outcome = await new ShellSession().run("sleep 10", { timeoutMs: 300 });
    expect(outcome).toMatchObject({ timedOut: true, exitCode: 124 });
  });
});

describe("toCommands", () => {
  it("keeps only prompted lines from a console block", () => {
    expect(toCommands("$ ls\nfile.txt\n$ pwd")).toBe("ls\npwd");
  });

  it("applies substitutions", () => {
    expect(toCommands("helm install <release>", { "<release>": "demo" })).toBe("helm install demo");
  });
});

describe("runTarget", () => {
  it("reports the documented step that broke, then still runs cleanup", async () => {
    const result = await runTarget(target());
    expect(result.passed).toBe(false);
    expect(result.failedStep?.step.block.headings.at(-1)).toBe("Break");
    expect(result.failedStep?.step.block.line).toBe(20);
    expect(result.failedStep?.outcome?.outputTail).toContain("about to fail");
    expect(result.steps.map((s) => s.status)).toEqual(["passed", "passed", "failed", "not-run"]);
    expect(result.teardown[0].status).toBe("passed");
  });

  it("passes when the broken section is skipped and the end state holds", async () => {
    const result = await runTarget(
      target({
        sections: ["Prepare", "Use"],
        assertions: [{ name: "Result file", run: "cat result.txt", expect: "hello from inner", retries: 0, intervalSeconds: 0 }],
      }),
    );
    expect(result.passed).toBe(true);
    expect(result.steps.filter((s) => s.status === "skipped").length).toBe(2);
  });

  it("finds expected text that comes before the last 40 lines of output", async () => {
    const result = await runTarget(
      target({
        sections: ["Prepare"],
        assertions: [
          { name: "Status line", run: 'echo "STATUS: deployed"; seq 1 60', expect: "STATUS: deployed", retries: 0, intervalSeconds: 0 },
        ],
      }),
    );
    expect(result.assertions[0].passed).toBe(true);
    expect(result.assertions[0].outputTail).not.toContain("STATUS: deployed");
  });

  it("fails on an end state check the guide does not meet", async () => {
    const result = await runTarget(
      target({ sections: ["Prepare"], assertions: [{ name: "Missing", run: "test -f nope.txt", retries: 1, intervalSeconds: 0 }] }),
    );
    expect(result.passed).toBe(false);
    expect(result.assertions[0]).toMatchObject({ passed: false, attempts: 2 });
  });
});
