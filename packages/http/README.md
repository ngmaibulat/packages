Full documentation: https://ngmaibulat.github.io/packages/http/

# @aibulat/http

An HTTPie-style command line HTTP client where **the method is the command**, with
first-class support for the new **QUERY** method. Zero runtime dependencies — nothing but
Node builtins.

```bash
get example.com/api q==search Authorization:'Bearer tok'
post example.com/users name=Alice age:=30
query example.com/search filter=active limit:=10
```

## Install

Requires Node 26 or later.

```bash
npm i -g @aibulat/http
```

This installs `httpc` plus a shortcut per method: `get`, `post`, `put`, `delete`,
`options`, `query`.

`head` and `patch` are **not** installed by default — they would shadow coreutils `head`
and GNU `patch` on your PATH. Use `httpc head` / `httpc patch`, or opt in explicitly:

```bash
httpc link head patch     # symlink them onto PATH (tells you what it shadows)
httpc unlink head patch   # undo
```

## Request items

Everything after the URL is a request item. Order does not matter, and any item may be
repeated.

| Syntax | Meaning | Example |
|---|---|---|
| `Name:value` | Request header | `Authorization:'Bearer tok'` |
| `Name:` | Remove a header we would otherwise send | `Accept:` |
| `Name;` | Send a header with an empty value | `X-Trace;` |
| `name==value` | URL query parameter | `q==search` `page==2` |
| `name=value` | Body field, string | `name=Alice` |
| `name:=value` | Body field, raw JSON | `age:=30` `tags:='["a","b"]'` |
| `name=@path` | Body field, string read from a file | `bio=@bio.txt` |
| `name:=@path` | Body field, JSON read from a file | `meta:=@meta.json` |
| `name@path` | File upload (switches the body to multipart) | `avatar@photo.png` |

Two rules govern how a token is split: the **earliest** separator wins, and at the same
position the **longest** one wins. So `email=a@b.com` is a field (the `=` at index 5 beats
the `@` at index 7), and `n:=5` is raw JSON rather than a header. Prefix a separator with
`\` to make it part of the name:

```bash
post example.com 'weird\:key=value'    # field named "weird:key"
```

Backslashes before anything else are left alone, so Windows paths and JSON escapes survive
unchanged.

### Body encoding

With no flags, body fields are sent as JSON. `--form` switches to
`application/x-www-form-urlencoded`, and any `@` item switches to `multipart/form-data`
(the boundary is generated for you — do not set `Content-Type` yourself).

```bash
post example.com/users name=Alice age:=30            # {"name":"Alice","age":30}
post example.com/users name=Alice --form             # name=Alice
post example.com/upload avatar@photo.png caption=hi  # multipart
post example.com/raw --raw '<xml/>' Content-Type:application/xml
post example.com/blob --file dump.bin                # the file is the whole body
echo '{"a":1}' | post example.com/things             # stdin is the body
```

## URL shorthands

```bash
get example.com          # -> http://example.com/
get :8080/api            # -> http://localhost:8080/api
get :/api                # -> http://localhost/api
```

## Flags

| Flag | Meaning |
|---|---|
| `-j, --json` | Serialize body fields as JSON (the default) |
| `-f, --form` | Serialize body fields as a form |
| `--multipart` | Force multipart even with no file item |
| `--raw <text>` | Send this literal string as the body |
| `--file <path>` | Send this file as the entire body |
| `-a, --auth <user[:pass]>` | Basic auth; omit the password to be prompted |
| `--bearer <token>` | `Authorization: Bearer <token>` |
| `-p, --print <HhBbm>` | H=request headers, B=request body, h=response headers, b=response body, m=timing |
| `--headers` / `--body` | Shorthand for `-p h` / `-p b` |
| `-v, --verbose` | Everything (`-p HBhbm`) |
| `-q, --quiet` | Print nothing |
| `-o, --output <file>` | Write the body to a file |
| `-d, --download` | Write to a filename derived from the response |
| `--pretty <all\|colors\|format\|none>` | Override colour and formatting detection |
| `-L, --follow` | Follow redirects (off by default) |
| `--max-redirects <n>` | Cap the chain (default 10; implies `--follow`) |
| `--timeout <sec>` | Give up after this long, including the download |
| `-k, --insecure` | Skip TLS verification |
| `--check-status` | Make 3xx/4xx/5xx affect the exit code |
| `--offline` | Build and print the request without sending it |
| `-h, --help` / `-V, --version` | Meta |

`-h` is **help**, not `--headers`. That is the one deliberate departure from HTTPie's short
flags: outside HTTPie's own ecosystem `-h` means help essentially everywhere.

Redirects are **not** followed by default, matching HTTPie and curl — when you are
inspecting an API, seeing the 302 is usually the point.

An item that starts with `-` needs a `--` separator first:

```bash
get example.com -- '-X-Odd:1'
```

## QUERY

`QUERY` ([draft-ietf-httpbis-safe-method-w-body][draft]) is a safe, idempotent method that
carries a request body — a GET that can send a real payload instead of stuffing everything
into the query string. It gets a first-class command here:

```bash
query example.com/search filter=active limit:=10
query example.com/search sort==asc filter=active   # body and query string together
```

Body items behave exactly as they do for `post`, defaulting to `application/json`. Because
the method is safe, it keeps its identity across a 302 rather than degrading to GET.

Two caveats worth knowing:

- Many reverse proxies, WAFs, and CDNs reject unknown methods with 405 or 501 before the
  origin ever sees the request. A failure is usually the peer, not this client.
- `SEARCH` is the older informal spelling of the same idea; `httpc search URL` works too.

[draft]: https://datatracker.ietf.org/doc/draft-ietf-httpbis-safe-method-w-body/

## Output and piping

To a terminal you get the status line, headers, and a colourised, pretty-printed body.
When stdout is redirected the default drops to the **body alone**, so pipelines work with
no flags:

```bash
get example.com/api | jq .
```

Colour follows [`NO_COLOR`](https://no-color.org) and `FORCE_COLOR`, and `--pretty`
overrides both. Binary bodies are summarised (`<binary data: 12.4 kB, image/png>`) rather
than dumped into your terminal, but stream through untouched when redirected. Timing and
progress go to stderr so stdout stays clean.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | A response was received (any status, unless `--check-status`) |
| 1 | Network, TLS, or file error |
| 2 | Usage error |
| 3 | Timed out |
| 4 | Too many redirects |
| 5 / 6 / 7 | 4xx / 5xx / 3xx, with `--check-status` |

## Migrating from 0.0.x

The URL is now positional, and `-f` means `--form`:

```bash
post -u https://x/post -f data.json      # 0.0.x
post https://x/post --file data.json     # 0.1.0
```

The old form still works for one release and prints a deprecation warning. (It also
*actually uploads the file* now — 0.0.x never awaited the file stream, so `POST` and `PUT`
silently sent nothing.)

## Not supported

- Nested keys (`user[name]=x`)
- Sessions, plugins, and config files
- Upload progress — it needs a streaming body, which forfeits `Content-Length` and
  redirect replay. Download progress does work.
- `--insecure` is process-wide: `fetch` has no per-request TLS option and undici's
  dispatcher is not a Node builtin.
- The `HTTP/1.1` in the status line is a label, not a measurement — `fetch` does not expose
  the negotiated protocol version.

## Development

```bash
pnpm install       # the package manager here is pnpm; pnpm-lock.yaml is committed
pnpm test          # runs straight off src/*.ts via Node's type stripping; no build, no network
pnpm run build     # compile to dist/ and mark the bins executable
pnpm run test:dist # the same suite against the built artifact
```

Tests run against a local `node:http` fixture rather than a public echo service, so they
work offline and cannot flake.

## License

MIT
