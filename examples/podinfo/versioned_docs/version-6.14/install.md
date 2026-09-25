---
title: Install podinfo on a local Kubernetes cluster
---

This guide installs podinfo 6.14.1 on a local kind cluster with Helm. At the end, you have two podinfo replicas running and answering requests.

## Prerequisites

- Docker, running
- [kind](https://kind.sigs.k8s.io/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [Helm](https://helm.sh/docs/intro/install/)

## Create the cluster

```bash
kind create cluster --name podinfo-demo --wait 120s
kubectl cluster-info --context kind-podinfo-demo
```

## Add the Helm repository

```bash
helm repo add podinfo https://stefanprodan.github.io/podinfo
helm repo update
```

## Install podinfo

Create a namespace, then install the chart with two replicas:

```bash
kubectl create namespace podinfo
helm install frontend podinfo/podinfo \
  --namespace podinfo \
  --version 6.14.1 \
  --set replicaCount=2
```

<details>
<summary>Helm values this guide sets</summary>

```yaml
replicaCount: 2
```

</details>

## Verify the installation

Wait for the deployment to finish rolling out:

```bash
kubectl rollout status deployment/frontend-podinfo -n podinfo --timeout=180s
```

Send a request to the service from inside the cluster. The response includes the version you installed:

```bash
kubectl run curl --namespace podinfo --image=curlimages/curl --rm -i --restart=Never -- \
  curl -s http://frontend-podinfo:9898/version
```

## Clean up

```bash
kind delete cluster --name podinfo-demo
```
