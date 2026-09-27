// Command line entry point, for running the same checks on your own machine.
//
//   install-sentinel validate "docs/**/*.md" [--strict]
//   install-sentinel run --config sentinel.yml [--target name] [--dry-run]

import { validatePaths } from "./commands.js";
import { loadManifest } from "./manifest.js";
import { checkPrerequisites } from "./prerequisites.js";
import { renderFindings, renderPlan, renderRunReport } from "./report.js";
import { describeStep, plan, runTarget } from "./run.js";

const USAGE = `Usage:
  install-sentinel validate <glob> [<glob> ...] [--strict]
  install-sentinel run --config <file> [--target <name>] [--dry-run]`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const flag = (name: string) => {
    const i = rest.indexOf(`--${name}`);
    return i === -1 ? undefined : rest[i + 1];
  };

  if (command === "validate") {
    const patterns = rest.filter((a) => !a.startsWith("--"));
    if (!patterns.length) return usage();
    const { files, findings } = await validatePaths(patterns, { strict: rest.includes("--strict") });
    console.log(renderFindings(findings, files.length));
    return findings.some((f) => f.severity === "error") ? 1 : 0;
  }

  if (command === "run") {
    const config = flag("config");
    if (!config) return usage();
    const only = flag("target");
    const targets = loadManifest(config).targets.filter((t) => !only || t.name === only);
    if (!targets.length) throw new Error(`No target named "${only}" in ${config}.`);

    if (rest.includes("--dry-run")) {
      for (const t of targets) {
        const steps = plan(t);
        console.log(renderPlan(t.name, steps, await checkPrerequisites(t, steps)) + "\n");
      }
      return 0;
    }

    const results = [];
    for (const t of targets) {
      console.log(`\n=== ${t.name}`);
      results.push(
        await runTarget(t, {
          onStepStart: (s, i) => console.log(`\n--- Step ${i + 1}: ${describeStep(s)}`),
          onOutput: (chunk) => process.stdout.write(chunk),
        }),
      );
    }
    console.log("\n" + renderRunReport(results));
    return results.every((r) => r.passed) ? 0 : 1;
  }

  return usage();
}

function usage(): number {
  console.error(USAGE);
  return 2;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error((error as Error).message);
    process.exit(2);
  },
);
