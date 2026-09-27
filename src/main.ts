// GitHub Action entry point. Reads inputs, runs a mode, and reports through the
// job summary and file annotations, so a failure shows up on the docs line itself.

import * as core from "@actions/core";
import path from "node:path";
import { changedFiles, pullRequestBase } from "./changed.js";
import { validatePaths } from "./commands.js";
import { loadManifest } from "./manifest.js";
import { describeMissing, renderFindings, renderRunReport } from "./report.js";
import { describeStep, runTarget } from "./run.js";

const rel = (file: string) => path.relative(process.env.GITHUB_WORKSPACE ?? process.cwd(), file);

async function validate(): Promise<void> {
  const patterns = core.getMultilineInput("paths", { required: true });
  const failOn = core.getInput("fail-on") || "error";
  let changed: string[] | undefined;
  if (core.getBooleanInput("changed-only")) {
    const base = pullRequestBase();
    if (base) changed = changedFiles(base);
    else core.info("changed-only applies to pull_request events, so every file that matches paths is checked.");
  }
  const { files, findings } = await validatePaths(patterns, { strict: core.getBooleanInput("strict") }, changed);

  for (const f of findings) {
    const props = { file: rel(f.file), startLine: f.line, title: `Install Sentinel: ${f.rule}` };
    if (f.severity === "error") core.error(f.message, props);
    else core.warning(f.message, props);
  }
  await core.summary.addRaw(renderFindings(findings, files.length)).write();

  const errors = findings.filter((f) => f.severity === "error").length;
  core.setOutput("findings-count", String(findings.length));
  core.setOutput("result", errors ? "failed" : "passed");

  const failing = failOn === "warning" ? findings.length : failOn === "error" ? errors : 0;
  if (failing) core.setFailed(`Install Sentinel found ${failing} problems in ${files.length} files.`);
}

async function run(): Promise<void> {
  const config = core.getInput("config", { required: true });
  const only = core.getInput("target");
  const targets = loadManifest(config).targets.filter((t) => !only || t.name === only);
  if (!targets.length) throw new Error(`No target named "${only}" in ${config}.`);

  const results = [];
  for (const target of targets) {
    let open = false;
    const result = await runTarget(target, {
      onStepStart: (step, i) => {
        if (open) core.endGroup();
        core.startGroup(`${target.name}: step ${i + 1}: ${describeStep(step)}`);
        open = true;
      },
      onOutput: (chunk) => process.stdout.write(chunk),
    });
    if (open) core.endGroup();
    results.push(result);

    for (const m of result.prerequisites.missing) {
      core.warning(describeMissing(result.prerequisites, m), {
        file: rel(m.file),
        startLine: m.line,
        title: "Install Sentinel: tool not in prerequisites",
      });
    }

    const failed = result.failedStep;
    if (failed) {
      core.error(`This step failed when run in CI (${target.name}). See the job summary for output.`, {
        file: rel(failed.step.block.file),
        startLine: failed.step.block.line,
        title: "Install Sentinel: documented step failed",
      });
    }
  }

  await core.summary.addRaw(renderRunReport(results)).write();
  const firstFailure = results.find((r) => !r.passed);
  core.setOutput("result", firstFailure ? "failed" : "passed");
  core.setOutput("failed-step", firstFailure?.failedStep ? describeStep(firstFailure.failedStep.step) : "");
  if (firstFailure) core.setFailed(`The documented install path failed for ${firstFailure.target.name}.`);
}

const mode = core.getInput("mode") || "validate";
(mode === "run" ? run() : validate()).catch((error) => core.setFailed((error as Error).message));
