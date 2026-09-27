# Tool guide

## Prerequisites

- [Helm](https://helm.sh) 3 or later
- kubectl.

## Install

```bash
# Add the repository
export NAME=demo
helm repo add demo https://example.com
kubectl get pods | grep demo
FOO=bar kind create cluster
cd /tmp && jq --version
cat <<EOF2 > values.yaml
yq: file content, not a command
EOF2
```
