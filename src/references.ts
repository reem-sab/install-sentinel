// Some docs sites do not paste commands into the page. A block marked `reference`
// holds a GitHub link, and the site renders the file behind that link. The reader
// runs what the site renders, so the runner has to fetch the same file.

import type { CodeBlock } from "./extract.js";

export interface RawLocation {
  url: string;
  startLine?: number;
  endLine?: number;
}

/**
 * Turns https://github.com/{owner}/{repo}/blob/{ref}/{path}#L3-L9 into a raw file URL.
 * The ref can contain slashes, for example stable/8.9. raw.githubusercontent.com
 * resolves that the same way github.com does, so the path is passed through whole.
 */
export function toRawLocation(link: string): RawLocation | null {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^#?]+)(?:#L(\d+)(?:-L(\d+))?)?$/.exec(link.trim());
  if (!m) return null;
  const [, owner, repo, refAndPath, start, end] = m;
  return {
    url: `https://raw.githubusercontent.com/${owner}/${repo}/${refAndPath}`,
    startLine: start ? Number(start) : undefined,
    endLine: end ? Number(end) : start ? Number(start) : undefined,
  };
}

export function isReference(block: CodeBlock): boolean {
  return block.meta.includes("reference");
}

const cache = new Map<string, string>();

/** Returns the text the reader sees for this block, fetching it if the block is a reference. */
export async function resolveContent(block: CodeBlock, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!isReference(block)) return block.content;

  const link = block.content.split("\n").find((l) => l.trim())?.trim() ?? "";
  const location = toRawLocation(link);
  if (!location) throw new Error(`Reference block does not hold a GitHub file link: ${link}`);

  let text = cache.get(location.url);
  if (text === undefined) {
    const response = await fetchImpl(location.url);
    if (!response.ok) throw new Error(`Reference ${link} returned HTTP ${response.status}.`);
    text = await response.text();
    cache.set(location.url, text);
  }

  if (location.startLine === undefined) return text;
  return text
    .split("\n")
    .slice(location.startLine - 1, location.endLine)
    .join("\n");
}
