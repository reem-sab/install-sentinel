# Install Sentinel

Install guides break without anyone touching them. A chart moves, a flag is renamed, a script changes on its release branch, and the guide still reads fine. Prose linting does not catch this, and neither does comparing docs to source. Only running the guide does.

Install Sentinel runs the install path a guide documents, in CI, the way a reader would. When a step fails, it tells you which heading and which line of the page broke.

It is the companion to [Doc Sentinel AI](https://github.com/reem-sab/doc-sentinel-ai). Doc Sentinel asks whether the docs still match the code. Install Sentinel asks whether the documented path still works when you run it.

## What it does

Install Sentinel has two modes.

**Validate** reads every code block in your Markdown and MDX files and checks the ones a reader copies into a config file. It needs no cluster and runs in seconds. By default it reports only mistakes that are never intentional:

- A tab character in YAML indentation, which makes the snippet fail to load
- A backtick at the start of a YAML value, which is Markdown formatting that renders literally inside a code block
- A code fence that never closes, which turns the rest of the page into code

**Run** executes a guide from start to finish:

1. Reads the guide in reading order, including imported partials, which render in place
2. Selects the blocks a reader runs, based on the sections you choose
3. Fetches `reference` blocks, which hold a GitHub link instead of the commands
4. Warns about tools the steps use that the guide's prerequisites section never mentions, and records the versions of Helm, kubectl, kind, and Docker under "Environment" in the report
5. Runs each block in order, carrying the working directory and exported variables from one step to the next, as one terminal session would
6. Checks the end state the guide promises
7. Runs the guide's cleanup steps, even after a failure

## Quick start

Check the docs in your repository on every pull request:

```yaml
- uses: reem-sab/install-sentinel@v0
  with:
    mode: validate
    paths: |
      docs/**/*.md
      versioned_docs/**/*.md
```

A finding appears as an annotation on the exact line of the docs file, in the pull request diff.

To run a guide, write a manifest:

```yaml
targets:
  - name: podinfo-next
    guide: docs/install.md
    teardown:
      - Clean up
    assertions:
      - name: Two replicas are ready, as the guide promises
        run: kubectl get deployment frontend-podinfo -n podinfo -o jsonpath='{.status.readyReplicas}'
        expect: "2"
```

Then run it:

```yaml
- uses: helm/kind-action@v1
  with:
    install_only: true
- uses: reem-sab/install-sentinel@v0
  with:
    mode: run
    config: sentinel.yml
    target: podinfo-next
```

To check several doc versions, add one target per version and use a job matrix. Each version then gets a fresh runner and a clean cluster.

## Run it on your machine

```bash
npm ci
npm run build

# Check code blocks
node dist/cli.js validate "docs/**/*.md"

# See which blocks a guide run would execute, without running anything
node dist/cli.js run --config examples/podinfo/sentinel.yml --dry-run

# Run a guide
node dist/cli.js run --config examples/podinfo/sentinel.yml --target podinfo-next
```

Start with `--dry-run`. The plan shows every block, whether it runs, and why a block is skipped. It also lists any tool a step uses that the prerequisites section does not mention, so you can fix the list before you need a cluster.

## Manifest reference

| Key | Description |
| --- | --- |
| `defaults` | Settings every target inherits. A target can override any of them. |
| `name` | Target name. Use it with the `target` input. |
| `guide` | Path to the guide, relative to the manifest. |
| `siteRoot` | Docs site root, for partials imported with `@site/`. |
| `sections` | Run only blocks under these headings, at any depth. Empty runs every shell block. |
| `teardown` | Headings whose blocks run last, even after a failure. |
| `skip` | Regular expressions. A block that matches is skipped, and the report says why. |
| `runDetails` | Run blocks inside `<details>`. Off by default, because readers expand those to read. |
| `env` | Environment variables for every step. |
| `substitutions` | Text to replace in commands, for placeholders like `<your-namespace>`. |
| `stepTimeoutMinutes` | Time limit for each step. Default 20. |
| `assertions` | End-state checks. Each has `name`, `run`, and optional `expect`, `retries`, and `intervalSeconds`. |

## Examples

- [`examples/podinfo`](examples/podinfo): a small versioned guide that runs on every scheduled build
- [`examples/camunda`](examples/camunda): the Camunda 8 Self-Managed kind guide, run as written for three doc versions. See [Resource math](docs/resource-math.md) for why it fits on a free runner.

## Learn more

- [Design notes](docs/design.md): the decisions behind the runner and what it deliberately does not do
- [Resource math](docs/resource-math.md): what a public GitHub runner can hold
