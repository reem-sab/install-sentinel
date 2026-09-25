// Static checks that need no cluster. They catch the snippets that look right on
// the page and fail the moment a reader copies them.
//
// The default rules only fire on mistakes that are never intentional. A full YAML
// parse is opt-in (strict), because real docs are full of deliberate fragments:
// elisions like "...", either/or alternatives in one block, and "invalid example"
// snippets. Run against 1,121 pages, strict parsing reported 162 errors, and most
// were written that way on purpose.

import { parseAllDocuments } from "yaml";
import type { CodeBlock, StructureIssue } from "./extract.js";
import { isReference } from "./references.js";

export type Severity = "error" | "warning";

export interface Finding {
  file: string;
  /** Absolute line in the file, not the line inside the block. */
  line: number;
  rule: string;
  severity: Severity;
  message: string;
  heading: string;
}

const YAML_LANGS = new Set(["yaml", "yml"]);

export interface ValidateOptions {
  /** Also parse every YAML block and report any syntax error. Expect intentional fragments. */
  strict?: boolean;
}

export function validateBlocks(blocks: CodeBlock[], issues: StructureIssue[] = [], options: ValidateOptions = {}): Finding[] {
  const findings: Finding[] = issues.map((issue) => ({ ...issue, severity: "error", heading: "" }));

  for (const block of blocks) {
    if (!YAML_LANGS.has(block.lang) || isReference(block)) continue;
    findings.push(...checkYaml(block, options.strict ?? false));
  }
  return findings;
}

function checkYaml(block: CodeBlock, strict: boolean): Finding[] {
  const findings: Finding[] = [];
  const lines = block.content.split("\n");
  // Content starts on the line after the opening fence.
  const toFileLine = (blockLine: number) => block.line + blockLine;
  const at = (blockLine: number, rule: string, severity: Severity, message: string): Finding => ({
    file: block.file,
    line: toFileLine(blockLine),
    rule,
    severity,
    message,
    heading: block.headings.at(-1) ?? "",
  });

  const reported = new Set<number>();
  lines.forEach((text, index) => {
    const blockLine = index + 1;
    if (/^[ ]*\t/.test(text)) {
      reported.add(blockLine);
      findings.push(
        at(blockLine, "yaml-tab-indent", "error", "Tab character in indentation. YAML allows only spaces, so this snippet fails to load when copied."),
      );
    }
    const code = withoutComment(text);
    if (code.includes("`")) {
      reported.add(blockLine);
      // A backtick that starts a value is a YAML syntax error. Anywhere else it may be intended.
      const startsValue = /(:\s+|^\s*-\s+)`/.test(code);
      findings.push(
        at(
          blockLine,
          "yaml-literal-backtick",
          startsValue ? "error" : "warning",
          startsValue
            ? "Value starts with a backtick, which YAML reserves. Markdown formatting renders literally in code, so the copied snippet fails to load."
            : "Backtick inside a YAML block. Markdown formatting renders literally in code, so the reader copies the backticks too.",
        ),
      );
    }
  });

  // Helm and Go templates are not YAML until they render. Parsing them only produces noise.
  if (!strict || block.content.includes("{{")) return findings;

  for (const doc of parseAllDocuments(block.content)) {
    for (const error of doc.errors) {
      const blockLine = error.linePos?.[0]?.line ?? 1;
      if (reported.has(blockLine)) continue; // Already reported with a clearer message.
      findings.push(at(blockLine, "yaml-parse", "error", `Invalid YAML: ${firstLine(error.message)}`));
    }
  }
  return findings;
}

/** Drops a trailing YAML comment. Good enough for a lint hint; it ignores # inside quotes. */
function withoutComment(line: string): string {
  const index = line.search(/(^|\s)#/);
  return index === -1 ? line : line.slice(0, index);
}

function firstLine(message: string): string {
  return message.split("\n")[0];
}
