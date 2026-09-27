# CLAUDE.md

Context for Claude Code working in this repository.

## What this project is

Install Sentinel is a TypeScript GitHub Action that runs the install path a guide documents, in CI, the way a reader would. When a step fails, it reports the heading and line of the page that broke.

It is the companion to [Doc Sentinel AI](https://github.com/reem-sab/doc-sentinel-ai). Doc Sentinel asks whether the docs still match the code. Install Sentinel asks whether the documented path still works when you run it.

Every line of this code should be easy to explain. That shapes how you work here (see "Working rules").

## Commands

```bash
npm ci
npm run typecheck   # tsc --noEmit
npm test            # vitest, test/**/*.test.ts
npm run build       # esbuild bundles src/ into dist/index.js (action) and dist/cli.js
npm run all         # all three, in order

node dist/cli.js validate "docs/**/*.md" [--strict]
node dist/cli.js run --config examples/podinfo/sentinel.yml --dry-run
node dist/cli.js run --config examples/podinfo/sentinel.yml --target podinfo-next
```

Always run `npm run all` before you finish a change. `dist/` is committed, because GitHub runs JavaScript actions straight from the repository. CI fails if `dist/` does not match the source.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/extract.ts` | Line scanner that reads Markdown and MDX into code blocks, in reading order. It tracks the heading trail, `<details>` depth, and exact line numbers, and it inlines imported partials where the page renders them. |
| `src/references.ts` | Resolves `bash reference` blocks. These hold a GitHub blob link, and the site renders the file behind it. Refs can contain slashes, such as `stable/8.9`. Supports `#L3-L9` ranges. |
| `src/validate.ts` | Static checks, no cluster needed. By default: `yaml-tab-indent`, `yaml-literal-backtick`, and `unclosed-fence`. Full YAML parsing is opt-in with `--strict`. |
| `src/session.ts` | `ShellSession` runs each step in its own bash process. It carries `cwd` and exported variables between steps, so the run behaves like one terminal. It uses process-group kill for timeouts. |
| `src/manifest.ts` | Loads `sentinel.yml`, with hand-written validation. `defaults` merge shallowly into each target. Paths resolve relative to the manifest. |
| `src/prerequisites.ts` | `checkPrerequisites()` takes the first word of each command in the runnable steps, including fetched reference scripts, and reports tools the guide's prerequisites section never mentions. Ignores shell keywords and a small allowlist of standard tools. |
| `src/run.ts` | `plan()` selects blocks by section, skip pattern, and `<details>`. `runTarget()` checks prerequisites, records tool versions, runs the steps, then the assertions, then the teardown. Teardown always runs. |
| `src/report.ts` | Renders Markdown for the job summary and terminal, plus the dry-run plan. Includes the Environment and Prerequisites sections. `renderFailure()` is shared with tracking issues. |
| `src/commands.ts` | `validatePaths()`, shared by the CLI and the action. Takes an optional list of changed files. |
| `src/changed.ts` | Lists files a pull request changed, with `git diff --name-only` against the base commit from the event payload. Used by `changed-only` and `--changed-since`. |
| `src/issues.ts` | `syncIssues()` opens, updates, or closes one issue per target in this repository, found by a hidden marker in the issue body. Uses `fetch` against the GitHub REST API. |
| `src/main.ts` | Action entry point. Writes annotations on the exact docs line, a job summary, and outputs. |
| `src/cli.ts` | Local CLI. |

Workflows in `.github/workflows/`:

- `ci.yml`: typecheck, test, build, and check that `dist/` is fresh. It also runs the action on its own examples.
- `install-check.yml`: runs the podinfo example on kind. Triggers are weekly, manual, and pull requests that touch examples or code.
- `camunda-kind.yml`: runs the Camunda 8 Self-Managed kind guide for Next, 8.9, and 8.8. Triggers are manual and weekly. It frees disk space first.
- `.github/dependabot.yml`: weekly grouped updates for npm and Actions.

## Key design decisions

Do not undo these without asking.

- **The guide is tested exactly as readers see it.** No test markup goes in the docs. Selection, skips, and assertions live in the manifest.
- **The extractor is a line scanner, not an MDX parser.** Full MDX parsers reject files that Docusaurus renders fine. The scanner also keeps line numbers exact.
- **Partials are inlined for `run` and not for `validate`.** This way `validate` checks each file once.
- **Blocks inside `<details>` do not run by default.** They are usually the source of a script the previous step already ran.
- **Strict YAML parsing is opt-in.** Across 1,121 Camunda Self-Managed pages, strict mode reported 162 parse errors, and most were intentional: `...` elisions, either/or alternatives, "invalid example" snippets, and mislabeled Elasticsearch requests. The default rules returned 16 findings on the same pages, all real.
- **The runtime is Node 24.** `action.yml` uses `node24`, and `.nvmrc` is 24. GitHub removed Node 20 from runners in September 2026. Camunda's docs repo pins Node 24.21.0.
- **Dependencies stay minimal:** `@actions/core`, `yaml`, and `fast-glob`. Ask before adding one.

## Verified facts

These were checked against real sources on Sept 25, 2026.

- **Validate against `camunda/camunda-docs`** returned 16 findings. All 16 are the two bug classes Reem fixed in PRs [#9937](https://github.com/camunda/camunda-docs/pull/9937) (tab in YAML) and [#9938](https://github.com/camunda/camunda-docs/pull/9938) (literal backticks). The bugs also exist in `version-8.8`, and the tab bug in `version-8.7`, which her PRs do not cover.
- **The Camunda kind guide dry-run** selects 8 steps for Next and 8.9, and 5 steps for 8.8, whose guide is structured differently. The identity-secret step comes from the partial `_partials/_identity-secret.md`.
- **A real partial run** of the first two Camunda steps passed. It fetched the reference script, cloned `camunda-deployment-references`, and kept the `cd` and the `SECONDARY_STORAGE` export.
- **Runners:** GitHub documents public repo runners as 4 CPUs and 16 GB RAM, and private repo runners as 2 CPUs and 8 GB. Runs 1 to 3 ran while the repo was private, and their logs show a 72 GB root filesystem with 34 GB free after cleanup. Future runs log CPU, memory, and disk before cleanup. The Camunda guide asks for 4 CPU and 8 GB with PostgreSQL storage, or 12 GB or more with Elasticsearch.
- **The Camunda kind guide passed end to end** for 8.8 and 8.9 in runs 2 and 3. camunda-next stops at "Deploy Camunda 8" because the unreleased 8.10 chart needs Helm v4 and the runner has v3.22.0.

## Not yet verified

- Whether the podinfo workflow has run on GitHub.
- camunda-next on a runner with Helm v4.

## Style for all prose

This covers README, docs, comments, and messages. Follow the [Sui documentation style guide](https://docs.sui.io/references/contribute/style-guide):

- Simple words, concise sentences, second person
- Sentence-case headings, no stacked headings
- No em dashes, no Latin abbreviations (write "for example", not "e.g."), no ampersands, no exclamation marks
- Product names without "the"
- "Choose", not "click"

Code comments explain **why**, not what. Keep that pattern.

Commit messages use the `type(scope): description` format, in present tense.

## Working rules

- Keep the code small and readable. Prefer a clear 20 lines over a clever 5.
- After any non-trivial change, explain what changed and why in plain language.
- Do not overstate what the tool does. It reports; it does not fix. It tests the path through the page, not the referenced scripts, which belong to their own repo.
- Report findings about other projects' docs as facts, with file and line.

## Possible next work

Ask before starting any of these.

1. Install Helm v4 for the camunda-next target only, matching the version pinned in `camunda-deployment-references/.tool-versions`, so the Next guide can run past Deploy Camunda 8. Until then, each scheduled run keeps the camunda-next tracking issue open. As of Sept 25, 2026, that file on `main` pins `helm 4.2.3`. Have the workflow read the version from `.tool-versions` at run time instead of hardcoding 4.2.3, because the pin will change.
2. Add a README badge for `install-check.yml`.
3. Add a `validate` job that checks `camunda-docs` Self-Managed pages weekly and reports without failing the build.
