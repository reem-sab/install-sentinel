// Plans which blocks of a guide a reader would run, then runs them in order,
// checks the end state the guide promises, and cleans up.

import { extractFile, type CodeBlock } from "./extract.js";
import type { Assertion, Target } from "./manifest.js";
import { isReference, resolveContent } from "./references.js";
import { ShellSession, toCommands, type StepOutcome } from "./session.js";

const SHELL_LANGS = new Set(["bash", "sh", "shell", "console", "zsh"]);

export type Role = "step" | "teardown";

export interface PlannedStep {
  block: CodeBlock;
  role: Role;
  /** Why the step is left out. Undefined means it runs. */
  skipReason?: string;
}

export interface StepResult {
  step: PlannedStep;
  outcome?: StepOutcome;
  /** Set when the step could not start, for example a reference that did not resolve. */
  error?: string;
  status: "passed" | "failed" | "skipped" | "not-run";
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  attempts: number;
  outputTail: string[];
}

export interface TargetResult {
  target: Target;
  passed: boolean;
  steps: StepResult[];
  assertions: AssertionResult[];
  teardown: StepResult[];
  failedStep?: StepResult;
}

export function plan(target: Target): PlannedStep[] {
  const { blocks } = extractFile(target.guide, { siteRoot: target.siteRoot, inlinePartials: true });
  const skip = target.skip.map((p) => new RegExp(p, "m"));
  const under = (block: CodeBlock, names: string[]) =>
    names.some((n) => block.headings.some((h) => h.toLowerCase() === n.toLowerCase()));

  return blocks
    .filter((b) => SHELL_LANGS.has(b.lang))
    .map((block): PlannedStep => {
      const role: Role = under(block, target.teardown) ? "teardown" : "step";
      let skipReason: string | undefined;
      if (role === "step" && target.sections.length && !under(block, target.sections)) {
        skipReason = "outside the selected sections";
      } else if (block.inDetails && !target.runDetails) {
        skipReason = "inside <details>, shown for reading";
      } else {
        const hit = skip.find((re) => re.test(block.content));
        if (hit) skipReason = `matches skip pattern /${hit.source}/`;
      }
      return { block, role, skipReason };
    });
}

export interface RunHooks {
  onStepStart?: (step: PlannedStep, index: number) => void;
  onStepEnd?: (result: StepResult) => void;
  onOutput?: (chunk: string) => void;
}

export async function runTarget(target: Target, hooks: RunHooks = {}): Promise<TargetResult> {
  const planned = plan(target);
  const session = new ShellSession(undefined, { ...process.env, ...target.env });
  const timeoutMs = target.stepTimeoutMinutes * 60_000;

  const steps: StepResult[] = [];
  let failed: StepResult | undefined;

  for (const [index, step] of planned.filter((s) => s.role === "step").entries()) {
    if (step.skipReason) {
      steps.push({ step, status: "skipped" });
      continue;
    }
    if (failed) {
      steps.push({ step, status: "not-run" });
      continue;
    }
    hooks.onStepStart?.(step, index);
    const result = await execute(session, step, target, timeoutMs, hooks);
    steps.push(result);
    hooks.onStepEnd?.(result);
    if (result.status === "failed") failed = result;
  }

  const assertions: AssertionResult[] = [];
  if (!failed) {
    for (const assertion of target.assertions) assertions.push(await check(session, assertion, timeoutMs));
  }

  // Teardown runs even after a failure, because a reader who gives up still has to clean up.
  const teardown: StepResult[] = [];
  for (const step of planned.filter((s) => s.role === "teardown")) {
    teardown.push(step.skipReason ? { step, status: "skipped" } : await execute(session, step, target, timeoutMs, hooks));
  }

  return {
    target,
    passed: !failed && assertions.every((a) => a.passed),
    steps,
    assertions,
    teardown,
    failedStep: failed,
  };
}

async function execute(
  session: ShellSession,
  step: PlannedStep,
  target: Target,
  timeoutMs: number,
  hooks: RunHooks,
): Promise<StepResult> {
  let content: string;
  try {
    content = await resolveContent(step.block);
  } catch (error) {
    return { step, status: "failed", error: (error as Error).message };
  }
  const outcome = await session.run(toCommands(content, target.substitutions), { timeoutMs, onOutput: hooks.onOutput });
  return { step, outcome, status: outcome.exitCode === 0 ? "passed" : "failed" };
}

async function check(session: ShellSession, assertion: Assertion, timeoutMs: number): Promise<AssertionResult> {
  let last: StepOutcome | undefined;
  for (let attempt = 1; attempt <= assertion.retries + 1; attempt++) {
    last = await session.run(assertion.run, { timeoutMs });
    const output = last.outputTail.join("\n");
    const passed = last.exitCode === 0 && (assertion.expect === undefined || output.includes(assertion.expect));
    if (passed) return { assertion, passed, attempts: attempt, outputTail: last.outputTail };
    if (attempt <= assertion.retries) await sleep(assertion.intervalSeconds * 1000);
  }
  return { assertion, passed: false, attempts: assertion.retries + 1, outputTail: last?.outputTail ?? [] };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function describeStep(step: PlannedStep): string {
  const where = step.block.headings.at(-1) ?? "(no heading)";
  const kind = isReference(step.block) ? "reference" : step.block.lang;
  return `${where} [${kind}, line ${step.block.line}]`;
}
