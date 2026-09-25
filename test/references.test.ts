import { describe, expect, it } from "vitest";
import { resolveContent, toRawLocation } from "../src/references.js";

describe("toRawLocation", () => {
  it("keeps a ref that contains a slash, such as a release branch", () => {
    expect(toRawLocation("https://github.com/camunda/camunda-deployment-references/blob/stable/8.9/local/procedure/cluster-create.sh")).toEqual({
      url: "https://raw.githubusercontent.com/camunda/camunda-deployment-references/stable/8.9/local/procedure/cluster-create.sh",
      startLine: undefined,
      endLine: undefined,
    });
  });

  it("reads a line range", () => {
    expect(toRawLocation("https://github.com/o/r/blob/main/a.sh#L3-L5")).toMatchObject({ startLine: 3, endLine: 5 });
    expect(toRawLocation("https://github.com/o/r/blob/main/a.sh#L7")).toMatchObject({ startLine: 7, endLine: 7 });
  });

  it("rejects links that are not GitHub file links", () => {
    expect(toRawLocation("https://example.com/a.sh")).toBeNull();
  });
});

describe("resolveContent", () => {
  it("fetches a reference and applies its line range", async () => {
    const fakeFetch = (async () => new Response("one\ntwo\nthree\nfour")) as typeof fetch;
    const block = {
      file: "g.md", line: 1, lang: "bash", meta: ["reference"], headings: [], inDetails: false,
      content: "https://github.com/o/r/blob/main/range.sh#L2-L3",
    };
    expect(await resolveContent(block, fakeFetch)).toBe("two\nthree");
  });

  it("explains a failed fetch", async () => {
    const fakeFetch = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    const block = { file: "g.md", line: 1, lang: "bash", meta: ["reference"], headings: [], inDetails: false, content: "https://github.com/o/r/blob/main/missing.sh" };
    await expect(resolveContent(block, fakeFetch)).rejects.toThrow("HTTP 404");
  });
});
