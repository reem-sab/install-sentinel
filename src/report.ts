// Turns results into Markdown for the GitHub job summary and for the terminal.
// The failure section leads with where the reader is on the page, because that
// is what a writer needs to fix it.

import path from "node:path";
import type { PrerequisiteReport, ToolUse } from "./prerequisites.js";
import type { PlannedStep, TargetResult } from "./run.js";
import { describeStep } from "./run.js";
import type { Finding } from "./validate.js";

const rel = (file: string) => path.relative(process.cwd(), file) || file;

export function renderRunReport(results: TargetResult[]): string {
  const out: string[] = ["## Install Sentinel run", "", "| Target | Result | Steps run | Failed at |", "| --- | --- | --- | --- |"];
  for (const r of results) {
    const ran = r.steps.filter((s) => s.status === "passed" || s.status === "failed").length;
    const failedAt = r.failedStep ? describeStep(r.failedStep.step) : r.assertions.some((a) => !a.passed) ? "End state check" : "";
    out.push(`| ${r.target.name} | ${r.passed ? "Passed" : "Failed"} | ${ran} | ${failedAt} |`);
  }

  for (const r of results.filter((x) => !x.passed)) {
    out.push("", `### ${r.target.name}`, "");
    const f = r.failedStep;
    if (f) {
      const b = f.step.block;
      out.push(`The guide broke at **${b.headings.join(" > ") || "(no heading)"}**.`, "");
      out.push(`- File: \`${rel(b.file)}\`, line ${b.line}`);
      if (f.outcome) {
        out.push(`- Exit code: ${f.outcome.exitCode}${f.outcome.timedOut ? " (timed out)" : ""}`);
        out.push("", "Last output:", "", "```text", ...f.outcome.outputTail, "```");
      } else if (f.error) {
        out.push(`- Could not start: ${f.error}`);
      }
    }
    for (const a of r.assertions.filter((x) => !x.passed)) {
      out.push("", `End state check **${a.assertion.name}** failed after ${a.attempts} attempts.`, "", "```text", ...a.outputTail, "```");
    }
  }

  const versions = results.flatMap((r) => r.environment.map((v) => ({ r, v })));
  if (versions.length) {
    out.push("", "### Environment", "", "Tool versions before the first step ran.", "", "| Target | Tool | Version |", "| --- | --- | --- |");
    for (const { r, v } of versions) out.push(`| ${r.target.name} | ${v.tool} | ${v.version} |`);
  }

  const warnings = results.filter((r) => r.prerequisites.missing.length);
  if (warnings.length) {
    out.push("", "### Prerequisites", "");
    for (const r of warnings) {
      for (const m of r.prerequisites.missing) out.push(`- ${r.target.name}: ${describeMissing(r.prerequisites, m)}`);
    }
  }

  const skipped = results.flatMap((r) => r.steps.filter((s) => s.status === "skipped").map((s) => ({ r, s })));
  if (skipped.length) {
    out.push("", "<details><summary>Skipped blocks</summary>", "");
    for (const { r, s } of skipped) out.push(`- ${r.target.name}: ${describeStep(s.step)}: ${s.step.skipReason}`);
    out.push("", "</details>");
  }
  return out.join("\n");
}

export function renderPlan(targetName: string, steps: PlannedStep[], prerequisites?: PrerequisiteReport): string {
  const out = [`Plan for ${targetName}`, ""];
  let n = 0;
  for (const s of steps) {
    const label = s.skipReason ? "  skip" : s.role === "teardown" ? "  last" : `${String(++n).padStart(4)}.`;
    const reason = s.skipReason ? `  (${s.skipReason})` : "";
    out.push(`${label} ${rel(s.block.file)}:${s.block.line}  ${s.block.headings.join(" > ")}${reason}`);
    if (!s.skipReason) out.push(`        ${preview(s.block.content)}`);
  }
  for (const m of prerequisites?.missing ?? []) out.push(`  warn ${describeMissing(prerequisites!, m)}`);
  return out.join("\n");
}

/** One line a writer can act on: which tool, where it is first used, and what the guide says about it. */
export function describeMissing(report: PrerequisiteReport, m: ToolUse): string {
  const where = report.section ? `the "${report.section}" section does not mention it` : "the guide has no prerequisites section";
  return `\`${m.command}\` is used at ${rel(m.file)}:${m.line}, but ${where}.`;
}

export function renderFindings(findings: Finding[], filesChecked: number): string {
  const errors = findings.filter((f) => f.severity === "error").length;
  const out = [
    "## Install Sentinel validate",
    "",
    `Checked ${filesChecked} files. Found ${errors} errors and ${findings.length - errors} warnings.`,
  ];
  if (findings.length) {
    out.push("", "| File | Line | Rule | Message |", "| --- | --- | --- | --- |");
    for (const f of findings) out.push(`| \`${rel(f.file)}\` | ${f.line} | ${f.rule} | ${f.message} |`);
  }
  return out.join("\n");
}

function preview(content: string): string {
  const first = content.split("\n").find((l) => l.trim() && !l.trim().startsWith("#")) ?? "";
  return first.length > 90 ? first.slice(0, 87) + "..." : first;
}
