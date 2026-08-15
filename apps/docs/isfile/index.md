# @aibulat/isfile

Check whether a path exists **and** is a regular file. A directory resolves to
`false`, not an error, and a missing path resolves to `false` rather than
rejecting — only a genuine stat failure (a permissions problem, for example)
rejects.

This is the leaf of the `@aibulat` dependency graph: `fs`, `json`, `mark`,
`naser` and `sendeml` all build on it.

## Install

```bash
npm install @aibulat/isfile
```

## Signature

```ts
function isFile(path: string): Promise<boolean>;
```

## Use

```ts
import isFile from "@aibulat/isfile";

const res = await isFile("filename.txt");

console.log(res);
```

## Behaviour

| Path                   | Result            |
| ---------------------- | ----------------- |
| an existing file       | `true`            |
| an existing directory  | `false`           |
| a path that is missing | `false`           |
| unreadable parent dir  | rejects with the stat error |
