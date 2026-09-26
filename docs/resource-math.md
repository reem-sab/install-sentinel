# Resource math

Can a free GitHub-hosted runner hold Camunda 8 Self-Managed? This page works it out before the workflow tries.

## What the runner has

A standard runner for a public repository has 4 CPUs and 16 GB of RAM. A private repository gets 2 CPUs and 8 GB of RAM on the same label.

Runs 1 to 3 ran while this repository was private. The repository is now public, so future runs get 4 CPUs and 16 GB of RAM.

Source: [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

## What the guide asks for

The Camunda kind guide asks for a container runtime with at least 4 CPU cores and 8 GB of RAM, and 12 GB or more when you choose Elasticsearch as secondary storage. The cluster has one control plane node and two workers.

## The fit

| Resource | Runner | PostgreSQL storage | Elasticsearch storage |
| --- | --- | --- | --- |
| CPU | 4 | 4 | 4 |
| RAM | 16 GB | 8 GB | 12 GB or more |

Both configurations fit on paper. The run uses PostgreSQL because it leaves the most headroom, and because CPU sits exactly at the guide's minimum either way.

Three kind nodes each pull their own copy of every image, so the workflow removes toolchains the job never uses before it starts. Disk was not tight in runs 1 to 3: in every job, `df -h /` showed a 72 GB root filesystem with 34 GB free. That output was taken after the cleanup step, so free space before cleanup is not recorded. From the next run on, the workflow records CPU, memory, and disk before cleanup.

## If it does not fit

If a run fails on resources, the failure itself is useful: it shows which component ran out and at what point. The next options are:

1. Record the peak memory and disk use from the failed run
2. Try a self-hosted or larger runner for the Camunda target only
3. Keep the Camunda target as a documented local run, and keep the lighter podinfo target as the scheduled CI proof

## Measured results

First run: [Camunda kind guide #1](https://github.com/reem-sab/install-sentinel/actions/runs/36168183740), Sept 25, 2026, commit `2df7991`.

| Target | Result | Duration | Peak disk used | Notes |
| --- | --- | --- | --- | --- |
| camunda-next | Failed | 6m 16s | Not measured | Step 20, "Deploy Camunda 8", exited before it deployed anything. The script builds a pre-release chart and, when run without a terminal, requires `CAMUNDA_PRERELEASE_ACK=true` or `--yes`. |
| camunda-8.9 | Failed | 11m 27s | Not measured | All 8 documented steps passed. The readiness script reported every pod Running and Healthy, and Helm reported chart `camunda-platform-14.10.0` as `deployed`. The job failed on the manifest check "The Helm release is deployed" after 1 attempt. The check looks for `STATUS: deployed` in the last 40 lines of `helm status` output, and the chart's release notes pushed that line out of those 40 lines. |
| camunda-8.8 | Failed | 13m 11s | Not measured | All 5 documented steps passed. The readiness script reported every pod Running and Healthy, and Helm reported chart `camunda-platform-13.13.1` as `deployed`. The job failed on the manifest check "The Helm release is deployed" after 1 attempt. The check looks for `STATUS: deployed` in the last 40 lines of `helm status` output, and the chart's release notes pushed that line out of those 40 lines. |

For camunda-next, the documented step "Deploy Camunda 8" failed because the deploy script asks you to confirm that you are deploying a pre-release chart, and CI has no terminal to answer the prompt.

For camunda-8.9 and camunda-8.8, no documented step failed. The failure is in Install Sentinel's check, not in the guide.

Runs 2 and 3, Sept 25, 2026:

- [Camunda kind guide #2](https://github.com/reem-sab/install-sentinel/actions/runs/36191715281), commit `bb778e1`, adds the `grep STATUS` workaround to the Helm check.
- [Camunda kind guide #3](https://github.com/reem-sab/install-sentinel/actions/runs/36194081336), commit `56a2fca`, adds the fix that matches checks against full output, and `CAMUNDA_PRERELEASE_ACK` for camunda-next.

| Run | Target | Result | Duration | Peak disk used | Notes |
| --- | --- | --- | --- | --- | --- |
| 2 | camunda-next | Failed | 10m 50s | Not measured | Step 20, "Deploy Camunda 8", stopped at the pre-release confirmation, as in run 1. This run did not yet set `CAMUNDA_PRERELEASE_ACK`. |
| 2 | camunda-8.9 | Passed | 8m 54s | Not measured | All steps and all three checks passed. |
| 2 | camunda-8.8 | Passed | 10m 39s | Not measured | All steps and all three checks passed. |
| 3 | camunda-next | Failed | 7m 10s | Not measured | Step 20, "Deploy Camunda 8", got past the pre-release confirmation and built chart `camunda-platform-8.10` from source. `helm install` then stopped with: "Camunda chart 15.x (8.10) requires Helm CLI v4 or later. Detected Helm CLI version: v3.22.0." |
| 3 | camunda-8.9 | Passed | 9m 51s | Not measured | All steps and all three checks passed. |
| 3 | camunda-8.8 | Passed | 13m 21s | Not measured | All steps and all three checks passed. |

The logs for runs 1 to 3 do not record CPU or memory. The repository was private at the time, so those runs used GitHub's standard private-repository runner, which GitHub documents as 2 CPUs and 8 GB of RAM. Based on that documented spec, the 8.8 and 8.9 guides passed on less than the guide's stated minimum of 4 CPUs. This is the documented spec, not a measurement.

For camunda-next, the unreleased docs deploy the in-development 8.10 chart, which requires Helm v4. The runner has Helm v3.22.0, so the documented step "Deploy Camunda 8" stopped before it installed anything.

## CI settings

These settings let CI answer what a reader answers by hand. They are not docs findings.

| Target | Setting | Why |
| --- | --- | --- |
| camunda-next | `CAMUNDA_PRERELEASE_ACK: "true"` in the target's `env` in `examples/camunda/sentinel.yml` | Next deploys a pre-release chart, and the deploy script asks you to confirm that. A reader answers the prompt. CI runs without a terminal, so the manifest answers it. |
