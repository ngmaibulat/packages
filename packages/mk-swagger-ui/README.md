Full documentation: https://ngmaibulat.github.io/packages/mk-swagger-ui/

### Overview

- CLI tool that turns an OpenAPI/Swagger YAML document into a static API reference site
- Renders with [Scalar](https://github.com/scalar/scalar), bundled into the output
- The generated folder is self-contained: four files, no CDN, works offline
- Also prints TypeScript interfaces for `components.schemas`

### Install/Upgrade

```bash
npm install -g mk-swagger-ui
npm update -g mk-swagger-ui
which mk-swagger-ui
```

### Use

```bash
mk-swagger-ui openapi.yaml               # generate ./dist
mk-swagger-ui openapi.yaml -o site       # generate ./site
mk-swagger-ui openapi.yaml --serve       # generate, then preview on :3000
mk-swagger-ui openapi.yaml --serve 8080  # preview on another port
mk-swagger-ui openapi.yaml --fonts       # use Scalar's hosted webfonts
```

Nothing is written outside the output directory, and the tool refuses to run if that
directory already exists -- pass `--force` to write into it anyway.

### Other commands

```bash
mk-swagger-ui types openapi.yaml   # print TypeScript interfaces for components.schemas
mk-swagger-ui get scalar           # git clone scalar/scalar
mk-swagger-ui get ui               # git clone swagger-api/swagger-ui
mk-swagger-ui get editor           # git clone swagger-api/swagger-editor
mk-swagger-ui get codegen          # git clone swagger-api/swagger-codegen
mk-swagger-ui clean                # remove the directories `get` cloned
```

### Results

- The output folder holds `index.html`, the Scalar bundle, an initializer and your spec
- The YAML document has been converted to JSON alongside them
- Scalar is configured to load that JSON
- The folder can be hosted on any web server, including one with no route to the internet
