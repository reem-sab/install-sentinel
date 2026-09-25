# Resource math

Can a free GitHub-hosted runner hold Camunda 8 Self-Managed? This page works it out before the workflow tries.

## What the runner has

A standard runner for a public repository has 4 CPUs, 16 GB of RAM, and 14 GB of SSD storage. A private repository gets 2 CPUs and 8 GB of RAM on the same label, so the repository must be public.

Source: [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

## What the guide asks for

The Camunda kind guide asks for a container runtime with at least 4 CPU cores and 8 GB of RAM, and 12 GB or more when you choose Elasticsearch as secondary storage. The cluster has one control plane node and two workers.

## The fit

| Resource | Runner | PostgreSQL storage | Elasticsearch storage |
| --- | --- | --- | --- |
| CPU | 4 | 4 | 4 |
| RAM | 16 GB | 8 GB | 12 GB or more |

Both configurations fit on paper. The run uses PostgreSQL because it leaves the most headroom, and because CPU sits exactly at the guide's minimum either way.

Disk is the likely limit, not memory. Three kind nodes each pull their own copy of every image, and the runner starts with only part of its 14 GB free. The workflow removes toolchains the job never uses before it starts.

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

## CI settings

These settings let CI answer what a reader answers by hand. They are not docs findings.

| Target | Setting | Why |
| --- | --- | --- |
| camunda-next | `CAMUNDA_PRERELEASE_ACK: "true"` in the target's `env` in `examples/camunda/sentinel.yml` | Next deploys a pre-release chart, and the deploy script asks you to confirm that. A reader answers the prompt. CI runs without a terminal, so the manifest answers it. |
