# Session guide

## Prepare

```bash
mkdir -p work/inner
cd work/inner
export GREETING=hello
```

## Use

```console
$ echo "$GREETING from $(basename "$PWD")" > result.txt
some sample output that is not a command
```

## Break

```bash
echo "about to fail"
false
```

## After the break

```bash
echo "never runs"
```

## Clean up

```bash
echo "cleanup ran" > cleanup.txt
```
