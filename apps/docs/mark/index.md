# @aibulat/mark

Render Markdown in the terminal — from a file or from stdin. Built on
[marked](https://www.npmjs.com/package/marked) with
[marked-terminal](https://www.npmjs.com/package/marked-terminal) as the renderer.

## Install

```bash
npm install -g @aibulat/mark
```

## Use

```bash
cat somefile.md | mark
mark -f somefile.md
```

Both forms go through the same renderer; with no `-f` the input is read from
stdin, which is what makes it composable in a pipeline:

```bash
gh pr view 42 --json body -q .body | mark
```

A missing `-f` target exits `1` with `File not found:` on stderr.
