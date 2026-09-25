// Reads a Markdown or MDX guide and returns its code blocks in reading order,
// with enough context to point a failure at the exact place a reader sees it.
//
// This is a line scanner, not a full Markdown parser. Docs sites mix Markdown,
// JSX, admonitions, and imported partials, and full MDX parsers reject files
// that Docusaurus renders fine. A scanner only has to find fences and headings,
// and it keeps line numbers exact.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface CodeBlock {
  /** File the reader sees this block in. For a partial, the partial's own file. */
  file: string;
  /** 1-based line of the opening fence. */
  line: number;
  /** Language from the info string, lowercased. "" when none. */
  lang: string;
  /** Words after the language, for example ["reference"]. */
  meta: string[];
  /** Heading trail from outermost to nearest, for example ["Install", "Create the cluster"]. */
  headings: string[];
  /** True when the block sits inside <details>, which readers expand to read, not to run. */
  inDetails: boolean;
  content: string;
}

export interface StructureIssue {
  file: string;
  line: number;
  rule: string;
  message: string;
}

export interface ExtractResult {
  blocks: CodeBlock[];
  issues: StructureIssue[];
}

export interface ExtractOptions {
  /** Root that `@site/` import paths resolve against. */
  siteRoot?: string;
  /** Inline imported partials where the page renders them. On for run, off for validate. */
  inlinePartials?: boolean;
}

interface Heading {
  level: number;
  text: string;
}

const MAX_PARTIAL_DEPTH = 5;

export function extractFile(file: string, options: ExtractOptions = {}): ExtractResult {
  const result: ExtractResult = { blocks: [], issues: [] };
  scan(path.resolve(file), [], options, result, 0);
  return result;
}

function scan(
  file: string,
  parentHeadings: Heading[],
  options: ExtractOptions,
  result: ExtractResult,
  depth: number,
): void {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const headings: Heading[] = [...parentHeadings];
  const imports = new Map<string, string>();
  let detailsDepth = 0;
  let i = skipFrontMatter(lines);

  while (i < lines.length) {
    const line = lines[i];
    const open = matchOpeningFence(line);

    if (open) {
      const close = findClosingFence(lines, i + 1, open.char, open.length);
      if (close === -1) {
        result.issues.push({
          file,
          line: i + 1,
          rule: "unclosed-fence",
          message: "Code fence never closes, so the rest of the page renders as code.",
        });
      }
      const end = close === -1 ? lines.length : close;
      const [lang = "", ...meta] = open.info.split(/\s+/).filter(Boolean);
      result.blocks.push({
        file,
        line: i + 1,
        lang: lang.toLowerCase(),
        meta,
        headings: headings.map((h) => h.text),
        inDetails: detailsDepth > 0,
        content: lines
          .slice(i + 1, end)
          .map((l) => removeIndent(l, open.indent))
          .join("\n"),
      });
      i = end + 1;
      continue;
    }

    const heading = matchHeading(line);
    if (heading) {
      while (headings.length && headings[headings.length - 1].level >= heading.level) headings.pop();
      headings.push(heading);
    }

    const imported = matchImport(line);
    if (imported) imports.set(imported.name, imported.source);

    const component = matchComponent(line);
    if (component && options.inlinePartials && imports.has(component)) {
      const partial = resolvePartial(file, imports.get(component)!, options.siteRoot);
      if (partial && depth < MAX_PARTIAL_DEPTH) {
        // The partial renders in place, under the headings the reader is in right now.
        scan(partial, headings, options, result, depth + 1);
      }
    }

    detailsDepth += count(line, /<details[\s>]/g) - count(line, /<\/details>/g);
    if (detailsDepth < 0) detailsDepth = 0;
    i++;
  }
}

function skipFrontMatter(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return 0;
  const end = lines.indexOf("---", 1);
  return end === -1 ? 0 : end + 1;
}

function matchOpeningFence(line: string) {
  const m = /^( *)(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m) return null;
  const info = m[3].trim();
  // CommonMark: a backtick fence's info string cannot contain a backtick.
  if (m[2][0] === "`" && info.includes("`")) return null;
  return { indent: m[1].length, char: m[2][0], length: m[2].length, info };
}

function findClosingFence(lines: string[], from: number, char: string, length: number): number {
  for (let j = from; j < lines.length; j++) {
    const m = /^ *(`{3,}|~{3,})\s*$/.exec(lines[j]);
    if (m && m[1][0] === char && m[1].length >= length) return j;
  }
  return -1;
}

/** Strips up to `indent` leading spaces, the same way the renderer does. Tabs stay, on purpose. */
function removeIndent(line: string, indent: number): string {
  let n = 0;
  while (n < indent && line[n] === " ") n++;
  return line.slice(n);
}

function matchHeading(line: string): Heading | null {
  const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  if (!m) return null;
  const text = m[2]
    .replace(/\s*\{#[^}]*\}\s*$/, "") // explicit anchor ids
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/`/g, "")
    .trim();
  return { level: m[1].length, text };
}

function matchImport(line: string) {
  const m = /^import\s+(\w+)\s+from\s+['"](.+?)['"];?\s*$/.exec(line.trim());
  if (!m) return null;
  // Docs repos often escape underscores in import paths, for example './\_partials/\_x.md'.
  return { name: m[1], source: m[2].replace(/\\_/g, "_") };
}

function matchComponent(line: string): string | null {
  const m = /^<([A-Z]\w*)(\s[^>]*)?\/>$/.exec(line.trim());
  return m ? m[1] : null;
}

function resolvePartial(fromFile: string, source: string, siteRoot?: string): string | null {
  if (!/\.mdx?$/.test(source)) return null;
  let resolved: string | null = null;
  if (source.startsWith("@site/") && siteRoot) resolved = path.join(siteRoot, source.slice(6));
  else if (source.startsWith(".")) resolved = path.resolve(path.dirname(fromFile), source);
  return resolved && existsSync(resolved) ? resolved : null;
}

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}
