import { describe, expect, it } from "vitest";
import type { Target } from "../src/manifest.js";
import { checkPrerequisites, commandsIn } from "../src/prerequisites.js";
import { plan } from "../src/run.js";

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;

const target = (guide: string): Target => ({
  name: "fixture", guide: fixture(guide), sections: [], teardown: [], skip: [], runDetails: false,
  env: {}, substitutions: {}, stepTimeoutMinutes: 1, assertions: [], openIssues: true,
});

const check = (guide: string) => {
  const t = target(guide);
  return checkPrerequisites(t, plan(t));
};

describe("commandsIn", () => {
  it("takes the first word of each command, after assignments and across pipes", () => {
    expect(commandsIn("FOO=bar kind create cluster\nkubectl get pods | grep x && jq .")).toEqual(["kind", "kubectl", "grep", "jq"]);
  });

  it("skips comments, shell keywords, continued arguments, and heredoc content", () => {
    const script = ["# helm is a comment", "export A=1", "if true; then", "  helm install x \\", "  --set y=1", "fi", "cat <<EOF", "yq: not a command", "EOF"].join("\n");
    expect(commandsIn(script)).toEqual(["helm", "cat"]);
  });

  it("does not count the script's own functions as tools", () => {
    expect(commandsIn("deploy() {\n  helm upgrade\n}\ndeploy")).toEqual(["helm"]);
  });
});

describe("checkPrerequisites", () => {
  it("reports tools the prerequisites section never mentions, with the step's file and line", async () => {
    const report = await check("prerequisites-guide.md");
    expect(report.section).toBe("Prerequisites");
    expect(report.tools.map((t) => t.command)).toEqual(["helm", "kubectl", "grep", "kind", "jq", "cat"]);
    // helm and kubectl are listed, grep and cat are standard tools.
    expect(report.missing).toEqual([
      expect.objectContaining({ command: "kind", line: 10 }),
      expect.objectContaining({ command: "jq", line: 10 }),
    ]);
  });

  it("reports every non-standard tool when the guide has no prerequisites section", async () => {
    const report = await check("no-prerequisites-guide.md");
    expect(report.section).toBeUndefined();
    expect(report.missing.map((m) => m.command)).toEqual(["helm"]);
  });
});
