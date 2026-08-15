# @aibulat/funtest

Zero-dependency smoke tests for a handful of publicly available REST APIs, written
with `node:test` and `fetch`.

This is not a library. It is published reference code you can run in one command to
see whether a set of well-known public APIs are behaving — and to read as an example
of testing an HTTP surface with nothing but the Node standard library.

## Run it

```bash
npx @aibulat/funtest@latest
```

Or point it at specific files:

```bash
npx @aibulat/funtest@latest dist/github.test.js
```

Needs **Node ≥ 22.18** — the suites are TypeScript, and from a clone they run through
Node's native type stripping with no build step.

## What it covers

| Suite | API |
| --- | --- |
| `github` | api.github.com |
| `hackernews` | hacker-news.firebaseio.com |
| `httpbin` | httpbingo.org |
| `ipinfo` | ipinfo.io |
| `jsonplaceholder` | jsonplaceholder.typicode.com |
| `randomuser` | randomuser.me |

Each suite asserts the same baseline through `src/utils.ts`: a JSON content type, an
optional utf-8 charset, a 200, and `ok`. Response shapes are checked against captured
sample payloads in `src/sample/`, so a renamed field upstream shows up as a failure
rather than as silence.

## In this repo

Every test here talks to the live internet, so `@aibulat/funtest` deliberately declares
**no `test` script** — that is what keeps the repo's `pnpm run test` hermetic. The suite
runs under `pnpm run test:live`, and in CI on a nightly schedule that never blocks a
merge. An API being down is not a bug in this package.
