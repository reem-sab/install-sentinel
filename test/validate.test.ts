import { describe, expect, it } from "vitest";
import { extractFile } from "../src/extract.js";
import { validateBlocks } from "../src/validate.js";

const check = (name: string, strict = false) => {
  const { blocks, issues } = extractFile(new URL(`./fixtures/${name}`, import.meta.url).pathname);
  return validateBlocks(blocks, issues, { strict });
};

describe("validateBlocks", () => {
  // Reproduces camunda/camunda-docs#9937: a tab in YAML indentation.
  it("flags a tab in YAML indentation at the file line a writer would edit", () => {
    const findings = check("tab-indent.md");
    expect(findings).toEqual([expect.objectContaining({ rule: "yaml-tab-indent", severity: "error", line: 11 })]);
  });

  it("does not repeat the tab as a parse error in strict mode", () => {
    expect(check("tab-indent.md", true).map((f) => f.rule)).toEqual(["yaml-tab-indent"]);
  });

  // Reproduces camunda/camunda-docs#9938: Markdown backticks inside a YAML sample.
  it("flags a value that starts with a backtick as an error", () => {
    const errors = check("literal-backticks.md").filter((f) => f.severity === "error");
    expect(errors).toEqual([expect.objectContaining({ rule: "yaml-literal-backtick", line: 5 })]);
  });

  it("ignores backticks in comments and allows them inside quoted strings", () => {
    const findings = check("literal-backticks.md").filter((f) => f.line > 8);
    expect(findings.every((f) => f.severity === "warning")).toBe(true);
  });

  it("skips YAML that is a Helm template", () => {
    const blocks = [{ file: "x.md", line: 1, lang: "yaml", meta: [], headings: [], inDetails: false, content: "image: {{ .Values.image }}\n  bad: indent" }];
    expect(validateBlocks(blocks, [], { strict: true })).toEqual([]);
  });

  it("reports parse errors only in strict mode", () => {
    const blocks = [{ file: "x.md", line: 10, lang: "yaml", meta: [], headings: ["H"], inDetails: false, content: "a: 1\n b: 2\nc: [" }];
    expect(validateBlocks(blocks)).toEqual([]);
    expect(validateBlocks(blocks, [], { strict: true }).length).toBeGreaterThan(0);
  });
});
