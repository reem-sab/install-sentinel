// A reader runs a guide in one terminal. A `cd` or `export` in step 2 still applies
// in step 5. Each step here runs in its own bash process so a failure maps to one
// block, so the session carries the working directory and exported variables from
// one process to the next.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface StepOutcome {
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  /** All of stdout and stderr, combined, so an end state check can search every line. */
  output: string;
  /** Last lines of combined stdout and stderr, for the report. */
  outputTail: string[];
}

export interface RunOptions {
  timeoutMs: number;
  /** Receives output as it arrives, for live logs in CI. */
  onOutput?: (chunk: string) => void;
}

const TAIL_LINES = 40;

export class ShellSession {
  readonly workdir: string;
  private readonly stateDir: string;

  constructor(workdir?: string, private readonly env: NodeJS.ProcessEnv = process.env) {
    this.workdir = workdir ?? mkdtempSync(path.join(os.tmpdir(), "install-sentinel-"));
    mkdirSync(this.workdir, { recursive: true });
    this.stateDir = mkdtempSync(path.join(os.tmpdir(), "install-sentinel-state-"));
    writeFileSync(path.join(this.stateDir, "cwd"), this.workdir);
    writeFileSync(path.join(this.stateDir, "env"), "");
  }

  run(script: string, options: RunOptions): Promise<StepOutcome> {
    const started = Date.now();
    const tail: string[] = [];
    let output = "";
    let partial = "";

    return new Promise((resolve) => {
      // detached puts bash in its own process group, so a timeout can stop
      // everything the step started, not only bash itself.
      const child = spawn("bash", ["-c", this.wrap(script)], {
        cwd: this.workdir,
        env: { ...this.env, SENTINEL_STATE: this.stateDir },
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const collect = (data: Buffer) => {
        const text = data.toString();
        options.onOutput?.(text);
        output += text;
        const lines = (partial + text).split("\n");
        partial = lines.pop() ?? "";
        tail.push(...lines);
        if (tail.length > TAIL_LINES) tail.splice(0, tail.length - TAIL_LINES);
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          // The process already exited.
        }
      }, options.timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        if (partial) tail.push(partial);
        resolve({
          exitCode: timedOut ? 124 : (code ?? 1),
          timedOut,
          durationMs: Date.now() - started,
          output,
          outputTail: tail.slice(-TAIL_LINES),
        });
      });
    });
  }

  /**
   * Restores the previous step's directory and exports, runs the step, then saves
   * both again on exit. Read-only variables and the ones bash manages itself are
   * left out, because sourcing them back would fail or lie.
   */
  private wrap(script: string): string {
    return [
      "set -eo pipefail",
      'source "$SENTINEL_STATE/env"',
      'cd "$(cat "$SENTINEL_STATE/cwd")"',
      "__sentinel_save() {",
      '  pwd > "$SENTINEL_STATE/cwd"',
      "  export -p | grep -vE '^declare -[a-zA-Z]*r|^declare -x (PWD|OLDPWD|SHLVL|_|SENTINEL_STATE)=' > \"$SENTINEL_STATE/env\" || true",
      "}",
      "trap __sentinel_save EXIT",
      script,
    ].join("\n");
  }
}

/**
 * Turns a block into the commands a reader would type. In a console block with
 * `$ ` prompts, only prompted lines are commands; the rest is sample output.
 */
export function toCommands(content: string, substitutions: Record<string, string> = {}): string {
  const lines = content.split("\n");
  const prompted = lines.filter((l) => /^\s*\$ /.test(l));
  let script = prompted.length ? prompted.map((l) => l.replace(/^\s*\$ /, "")).join("\n") : content;
  for (const [from, to] of Object.entries(substitutions)) script = script.split(from).join(to);
  return script;
}
