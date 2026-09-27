// The manifest says which guide to run and how. It exists so the guide itself
// never needs test markup: you test the page exactly as readers see it.

import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

export interface Assertion {
  name: string;
  run: string;
  /** Output must contain this text. Without it, exit code 0 is enough. */
  expect?: string;
  retries: number;
  intervalSeconds: number;
}

export interface Target {
  name: string;
  guide: string;
  siteRoot?: string;
  /** Run blocks under these headings, at any depth. Empty means every block. */
  sections: string[];
  /** Run blocks under these headings last, even after a failure. */
  teardown: string[];
  /** Regular expressions. A matching block is left out, and the report says why. */
  skip: string[];
  /** Run blocks inside <details>. Off by default: readers expand those to read. */
  runDetails: boolean;
  env: Record<string, string>;
  substitutions: Record<string, string>;
  stepTimeoutMinutes: number;
  assertions: Assertion[];
  /** Track this target in an issue when open-issues is on. On by default. */
  openIssues: boolean;
}

export interface Manifest {
  targets: Target[];
}

type Raw = Record<string, unknown>;

export function loadManifest(file: string): Manifest {
  const raw = parse(readFileSync(file, "utf8")) as Raw | null;
  if (!raw || !Array.isArray(raw.targets) || raw.targets.length === 0) {
    throw new Error(`${file}: add a "targets" list with at least one target.`);
  }
  const defaults = (raw.defaults ?? {}) as Raw;
  const baseDir = path.dirname(path.resolve(file));
  const targets = (raw.targets as Raw[]).map((t, i) => toTarget({ ...defaults, ...t }, baseDir, `${file}: targets[${i}]`));

  const names = new Set<string>();
  for (const t of targets) {
    if (names.has(t.name)) throw new Error(`${file}: target name "${t.name}" is used twice.`);
    names.add(t.name);
  }
  return { targets };
}

function toTarget(raw: Raw, baseDir: string, where: string): Target {
  const name = requireString(raw.name, `${where}.name`);
  const guide = requireString(raw.guide, `${where}.guide`);
  return {
    name,
    // Paths are relative to the manifest, so a manifest works from any directory.
    guide: path.resolve(baseDir, guide),
    siteRoot: typeof raw.siteRoot === "string" ? path.resolve(baseDir, raw.siteRoot) : undefined,
    sections: stringList(raw.sections, `${where}.sections`),
    teardown: stringList(raw.teardown, `${where}.teardown`),
    skip: stringList(raw.skip, `${where}.skip`),
    runDetails: raw.runDetails === true,
    env: stringMap(raw.env, `${where}.env`),
    substitutions: stringMap(raw.substitutions, `${where}.substitutions`),
    stepTimeoutMinutes: typeof raw.stepTimeoutMinutes === "number" ? raw.stepTimeoutMinutes : 20,
    assertions: ((raw.assertions ?? []) as Raw[]).map((a, i) => ({
      name: requireString(a.name, `${where}.assertions[${i}].name`),
      run: requireString(a.run, `${where}.assertions[${i}].run`),
      expect: a.expect === undefined ? undefined : String(a.expect),
      retries: typeof a.retries === "number" ? a.retries : 0,
      intervalSeconds: typeof a.intervalSeconds === "number" ? a.intervalSeconds : 5,
    })),
    openIssues: raw.openIssues !== false,
  };
}

function requireString(value: unknown, where: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${where} must be a non-empty string.`);
  return value;
}

function stringList(value: unknown, where: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) throw new Error(`${where} must be a list of strings.`);
  return value;
}

function stringMap(value: unknown, where: string): Record<string, string> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${where} must be a map.`);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)]));
}
