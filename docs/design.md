# Design notes

## Test the page, not a copy of it

The guide stays exactly as readers see it. Nothing in the docs marks a block as testable. Selection, skips, and end-state checks live in a separate manifest. That keeps test markup out of published pages, and it means you can point Install Sentinel at a repository you do not own.

## A line scanner instead of an MDX parser

Docs sites mix Markdown, JSX components, admonitions, and imported partials. Full MDX parsers reject files that the site renders fine. Install Sentinel only needs fences, headings, imports, and `<details>` tags, so it scans lines. That also keeps every line number exact, which is what makes a failure point at the right place.

## Reading order includes partials

A partial imported into a page renders where the component appears. The first dry run against the Camunda kind guide skipped a step: the command that creates the identity secrets lives in a partial. A run without it would fail at deployment and blame the wrong step. Install Sentinel now inlines partials in place, under the heading the reader is in, and reports the partial's own file and line when one of its steps fails.

## One terminal session

A reader runs the whole guide in one terminal. A `cd` in the download step still applies three steps later. Each step here runs in its own process, so a failure maps to one block. To match the reader's terminal, the session saves the working directory and exported variables when a step exits and restores them before the next step.

## Reference blocks

Some docs sites show a script from another repository instead of pasting commands. The block holds a GitHub link, and the site renders the file behind it. Install Sentinel fetches the same file, at the same branch and line range, so it runs what the reader sees. Release branches with a slash in the name, such as `stable/8.9`, resolve correctly.

## Blocks inside `<details>` do not run

A collapsed block is usually the source of a script the previous step already ran, shown for reading. Running it would repeat the step. You can turn this on per target with `runDetails`.

## Strict YAML parsing is opt-in

A full YAML parse sounds like the obvious check. Run across 1,121 Camunda Self-Managed pages, it reported 162 parse errors, and on reading them, most were written that way on purpose: `...` elisions, either/or alternatives in one block, "invalid example" snippets, and requests for other tools shown in a YAML block. A check that cries wolf gets turned off. The default rules fire only on mistakes that are never intentional. On the same 1,121 pages, they returned 16 findings, and every one was a real copy-and-paste failure.

## What it deliberately does not do

- It does not fix anything. It reports, with the file and line, and a writer decides.
- It does not judge prose. That is a style linter's job.
- It does not replace tests for the scripts a guide references. Those belong in the repository that owns the scripts. Install Sentinel tests the path through the page: the order, the sections, the exports, and the directory changes a reader makes.
