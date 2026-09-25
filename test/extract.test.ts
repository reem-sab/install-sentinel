import { describe, expect, it } from "vitest";
import { extractFile } from "../src/extract.js";

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;

describe("extractFile", () => {
  it("keeps exact line numbers and the heading trail", () => {
    const { blocks } = extractFile(fixture("structure.md"), { inlinePartials: true });
    const linux = blocks.find((b) => b.content === "echo linux")!;
    expect(linux.line).toBe(14);
    expect(linux.headings).toEqual(["Guide", "Install"]);
  });

  it("removes fence indentation inside JSX components", () => {
    const { blocks } = extractFile(fixture("structure.md"), { inlinePartials: true });
    expect(blocks.map((b) => b.content)).toContain("echo linux");
  });

  it("inlines a partial where the page renders it, with the partial's own file and line", () => {
    const { blocks } = extractFile(fixture("structure.md"), { inlinePartials: true });
    const fromPartial = blocks.find((b) => b.content === "echo from partial")!;
    expect(fromPartial.file).toMatch(/_partials\/_setup\.md$/);
    expect(fromPartial.line).toBe(3);
    expect(fromPartial.headings).toEqual(["Guide", "Install", "Set up credentials"]);
    // Reading order: the partial sits between the Linux block and the <details> block.
    expect(blocks.map((b) => b.content.trim())).toEqual(["echo linux", "echo from partial", "echo for reading only", "echo done"]);
  });

  it("leaves partials out when asked, so validate checks each file once", () => {
    const { blocks } = extractFile(fixture("structure.md"), { inlinePartials: false });
    expect(blocks.map((b) => b.content)).not.toContain("echo from partial");
  });

  it("marks blocks inside <details>", () => {
    const { blocks } = extractFile(fixture("structure.md"), { inlinePartials: true });
    expect(blocks.find((b) => b.content === "echo for reading only")!.inDetails).toBe(true);
    expect(blocks.find((b) => b.content.trim() === "echo done")!.inDetails).toBe(false);
  });

  it("cleans link syntax and anchor ids out of headings", () => {
    const { blocks } = extractFile(fixture("structure.md"), { inlinePartials: true });
    expect(blocks.at(-1)!.headings).toEqual(["Guide", "Verify the result"]);
  });

  it("reports a fence that never closes", () => {
    const { issues } = extractFile(fixture("structure.md"));
    expect(issues).toEqual([expect.objectContaining({ rule: "unclosed-fence", line: 34 })]);
  });
});
