# @aibulat/http

An HTTPie-style command line HTTP client where **the method is the command**, with
first-class support for the **QUERY** method. Zero runtime dependencies — nothing but
Node builtins.

## Install / upgrade

```bash
npm install -g @aibulat/http
npm update -g @aibulat/http
which httpc get post
```

Needs **Node ≥ 26**.

## Use

Each method is its own command, so the verb is the thing you type:

```bash
get httpbin.org/get
post httpbin.org/post name=aibulat active:=true
put httpbin.org/put < payload.json
query httpbin.org/anything q=search
```

`httpc` is the same client with the method as an argument:

```bash
httpc GET httpbin.org/get
httpc --help
```

## The opt-in shortcuts

`head` and `patch` are real commands on most systems — coreutils `head` and GNU
`patch` — and npm's global bin directory usually comes before `/usr/bin` on `PATH`.
Installing them by default would shadow those tools system-wide, so they are opt-in:

```bash
httpc link head patch     # symlink them next to the httpc shim
httpc unlink head patch   # and take them back off
```

`httpc link` tells you what each new link now shadows, and refuses to replace anything
it did not create itself.

## Notes

- The programmatic surface (`import { parseArgv, buildRequest, send } from '@aibulat/http'`)
  exists, but the CLI is the primary interface.
- Not supported on Windows for `link`/`unlink`; define a `doskey` alias instead.
