# @aibulat/naser

A CLI tool to convert files containing ANSI output into HTML, based on the
[anser](https://www.npmjs.com/package/anser) package.

## Install / upgrade

```bash
npm install -g @aibulat/naser
npm update -g @aibulat/naser
which naser
```

### Via Bun

```bash
bun install -g @aibulat/naser
bun update -g @aibulat/naser --latest
bun pm ls -g
which naser
```

## Use

```bash
echo -e "\e[32m Hello \e[0m" > out.txt
naser out.txt > out.html
```
