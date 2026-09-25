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

Fill this in from real runs.

| Target | Result | Duration | Peak disk used | Notes |
| --- | --- | --- | --- | --- |
| camunda-next | | | | |
| camunda-8.9 | | | | |
| camunda-8.8 | | | | |
