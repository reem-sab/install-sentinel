// A guide usually lists the tools a reader needs before they start. When a step
// uses a tool that list never mentions, the reader finds out halfway through.
// This check compares the two before anything runs, so it needs no cluster.

import { readFileSync } from "node:fs";
import type { Target } from "./manifest.js";
import { resolveContent } from "./references.js";
import type { PlannedStep } from "./run.js";
import { toCommands } from "./session.js";

/** Words that start a line but are shell syntax or built-ins, not tools a reader installs. */
const SHELL_WORDS = new Set([
  "cd", "export", "echo", "if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done",
  "case", "esac", "function", "return", "exit", "local", "set", "unset", "source", "read", "shift",
  "trap", "eval", "exec", "printf", "true", "false", "test", "wait", "break", "continue", "declare",
]);

/** Standard tools every runner has, so a guide does not need to list them. */
const STANDARD_TOOLS = new Set([
  "ls", "cat", "grep", "sed", "awk", "mkdir", "rm", "cp", "mv", "touch", "chmod", "curl", "wget", "git",
  "bash", "sh", "head", "tail", "sort", "uniq", "wc", "tr", "cut", "tee", "xargs", "find", "sleep",
  "pwd", "env", "which", "command", "sudo", "tar", "base64", "date", "basename", "dirname",
]);

/** How to ask a tool for its version. Only these tools get an Environment entry. */
export const VERSION_COMMANDS: Record<string, string> = {
  helm: "helm version --short",
  kubectl: "kubectl version --client",
  kind: "kind version",
  docker: "docker --version",
};

export interface ToolUse {
  command: string;
  /** File and line of the first step that uses the tool. */
  file: string;
  line: number;
}

export interface PrerequisiteReport {
  /** Every tool the runnable steps use, in the order a reader first meets it. */
  tools: ToolUse[];
  /** Tools the prerequisites section never mentions. */
  missing: ToolUse[];
  /** The prerequisites heading. Undefined when the guide has none. */
  section?: string;
}

export async function checkPrerequisites(target: Target, steps: PlannedStep[]): Promise<PrerequisiteReport> {
  const tools: ToolUse[] = [];
  const seen = new Set<string>();
  for (const step of steps.filter((s) => !s.skipReason)) {
    let content: string;
    try {
      content = await resolveContent(step.block);
    } catch {
      continue; // The run itself reports a reference that does not resolve.
    }
    for (const command of commandsIn(toCommands(content, target.substitutions))) {
      if (seen.has(command)) continue;
      seen.add(command);
      tools.push({ command, file: step.block.file, line: step.block.line });
    }
  }

  const section = findPrerequisites(target.guide);
  const missing = tools.filter((t) => !STANDARD_TOOLS.has(t.command) && !section?.words.has(t.command.toLowerCase()));
  return { tools, missing, section: section?.heading };
}

/** Returns the first word of each command in a script: the tool a reader needs to have. */
export function commandsIn(script: string): string[] {
  const found: string[] = [];
  const defined = new Set<string>();
  let heredocEnd: string | undefined;
  let continued = false;

  for (const raw of script.split("\n")) {
    const line = raw.trim();
    // Lines inside a heredoc are file content, not commands.
    if (heredocEnd) {
      if (line === heredocEnd) heredocEnd = undefined;
      continue;
    }
    // A line after a trailing backslash holds arguments, not a new command.
    const isArguments = continued;
    continued = line.endsWith("\\");
    heredocEnd = /<<-?\s*['"]?(\w+)['"]?/.exec(line)?.[1];
    if (isArguments || !line || line.startsWith("#")) continue;

    // A script's own functions are not tools to install.
    const fn = /^(?:function\s+)?([\w-]+)\s*\(\)/.exec(line);
    if (fn) defined.add(fn[1]);

    for (const part of line.split(/&&|\|\||[|;]/)) {
      const words = part.trim().split(/\s+/);
      let i = 0;
      while (/^\w+=/.test(words[i] ?? "")) i++; // FOO=bar cmd runs cmd
      const name = words[i] ?? "";
      if (/^[a-z][\w.+-]*$/i.test(name) && !SHELL_WORDS.has(name)) found.push(name);
    }
  }
  return found.filter((name) => !defined.has(name));
}

/** Finds the first heading that mentions prerequisites and collects every word under it. */
function findPrerequisites(guide: string): { heading: string; words: Set<string> } | undefined {
  const lines = readFileSync(guide, "utf8").split(/\r?\n/);
  let inFence = false;
  let level = 0;
  let heading = "";
  const words = new Set<string>();

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    // A "#" inside a code block is a shell comment, not a heading.
    const h = inFence ? null : /^(#{1,6})\s+(.+)$/.exec(line);
    if (h && level && h[1].length <= level) break;
    if (h && !level && /prerequisite/i.test(h[2])) {
      level = h[1].length;
      heading = h[2].trim();
      continue;
    }
    // Trailing dots are sentence ends: "Install Helm." mentions helm.
    if (level) for (const w of line.toLowerCase().match(/[a-z0-9][\w.+-]*/g) ?? []) words.add(w.replace(/\.+$/, ""));
  }
  return level ? { heading, words } : undefined;
}
