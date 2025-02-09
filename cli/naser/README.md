### Overview

- CLI tool to convert files with ANSI output to HTML
- Based on Anser package

### Install/Upgrade

```bash
npm install -g @aibulat/naser
npm update -g @aibulat/naser
which naser
```

### Install/Upgrade via Bun

```bash
bun install -g @aibulat/naser
bun update -g @aibulat/naser --latest
bun pm ls -g
which naser
```

### Use

```bash
echo -e "\e[32m Hello \e[0m" > out.txt
naser out.txt > out.html
```
