# mk-swagger-ui

Turn an OpenAPI/Swagger YAML document into a static API reference site you can deploy
anywhere. The renderer is [Scalar](https://github.com/scalar/scalar), bundled into the
output, so the generated folder needs nothing from the network at run time.

This is one of two packages here published without the `@aibulat` scope — it has been on
npm as plain `mk-swagger-ui` since 2022, and keeping the name keeps existing installs
working.

## Install

```bash
npm install -g mk-swagger-ui
```

Or run it without installing:

```bash
npx mk-swagger-ui openapi.yaml
```

## Use

```bash
mk-swagger-ui openapi.yaml               # generate ./dist
mk-swagger-ui openapi.yaml -o site       # generate ./site
mk-swagger-ui openapi.yaml --force       # write into an output directory that exists
mk-swagger-ui openapi.yaml --serve       # generate, then preview on port 3000
mk-swagger-ui openapi.yaml --serve 8080  # preview on another port
```

## What lands in the output directory

Four files, and nothing is written outside them:

| File | |
| --- | --- |
| `index.html` | the page, titled from the document's `info.title` |
| `scalar.js` | Scalar's standalone browser bundle, copied verbatim (~3.5 MB) |
| `scalar-initializer.js` | the `Scalar.createApiReference()` call, editable after generation |
| `<name>.json` | your document converted to JSON, named after the input file |

By default the tool refuses to run when the output directory already exists; `--force`
writes into it, leaving unrelated files in place.

Exit codes: `1` for a missing input file or an output directory that already exists, `2`
for a document that will not parse.

## Offline by default

Scalar's default theme pulls webfonts from `fonts.scalar.com`, and its API client can route
"Test Request" traffic through `proxy.scalar.com`. Neither is used here: the generated page
is written with `withDefaultFonts: false` and no `proxyUrl`, so it renders identically on a
machine with no route to the internet and sends no visitor traffic to a third party. The
output is verified to reference no external host.

Pass `--fonts` to opt back into the hosted webfonts.

```bash
mk-swagger-ui openapi.yaml --fonts
```

## Generating TypeScript interfaces

```bash
mk-swagger-ui types openapi.yaml
```

Prints one `export interface` per entry in `components.schemas`. `$ref` properties resolve
to the referenced interface name, `type: array` becomes `Array<T>`, and anything the
mapping does not recognise falls back to `any`.

```ts
export interface Pet {
    id: number;
    name: string;
    tags: Array<string>;
    owner: Owner;
}
```

## Working with the upstream projects

```bash
mk-swagger-ui get scalar    # git clone scalar/scalar
mk-swagger-ui get ui        # git clone swagger-api/swagger-ui
mk-swagger-ui get editor    # git clone swagger-api/swagger-editor
mk-swagger-ui get codegen   # git clone swagger-api/swagger-codegen
mk-swagger-ui clean         # remove whatever `get` cloned
```

## Notes on the 1.x line

Versions up to 1.0.6 rendered with **Swagger UI**, not Scalar, and copied eight files out of
`swagger-ui-dist`. The output shape changed with the renderer; the command line did not,
beyond the new `--fonts` flag.

Those versions also shipped six separate bins — `mk-swagger-ui`, `list`, `clean`,
`get-editor`, `get-ui` and `get-codegen` — four of which claimed very generic names in the
global `PATH`. They are subcommands of the single `mk-swagger-ui` bin now.

They also wrote a `package.json` into your current directory and ran `npm install` there to
fetch the renderer, then copied the assets out of your `node_modules`. The renderer is a
dependency of this package now, so the working directory is left alone.
