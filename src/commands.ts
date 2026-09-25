// The two things Install Sentinel does, shared by the GitHub Action and the CLI.

import fg from "fast-glob";
import { extractFile } from "./extract.js";
import { validateBlocks, type Finding, type ValidateOptions } from "./validate.js";

export interface ValidateResult {
  files: string[];
  findings: Finding[];
}

/** Checks every Markdown and MDX file the patterns match. Needs no cluster. */
export async function validatePaths(patterns: string[], options: ValidateOptions = {}): Promise<ValidateResult> {
  const files = (await fg(patterns, { onlyFiles: true, absolute: true, ignore: ["**/node_modules/**"] }))
    .filter((f) => /\.mdx?$/.test(f))
    .sort();
  const findings: Finding[] = [];
  for (const file of files) {
    // Partials stay separate here: each file is checked once, as itself.
    const { blocks, issues } = extractFile(file, { inlinePartials: false });
    findings.push(...validateBlocks(blocks, issues, options));
  }
  return { files, findings };
}
