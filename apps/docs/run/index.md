# @aibulat/run

Run a process with environment variables preloaded from a file.

By default it tries to load `.env` from the current directory. Another env file can be
specified with `-e`; if one is specified explicitly, it must exist.

The package can run a process:

- once
- multiple times
- infinitely
- on filesystem changes
- with a specified pause between runs
- with a specified env file
- with output logging

## Install

```bash
npm install -g @aibulat/run
run --version
```

Or without installing:

```bash
npx @aibulat/run --version
npx @aibulat/run --help
npx @aibulat/run <cmd>
npx @aibulat/run -e some-env-file <cmd>
```

The package installs four binaries: `run`, `logview`, `output` and `shell`.

## Support

- Node.js v22.5.0 and above
- Linux

### Prerequisites

None beyond Node.js itself.

The package uses `@lydell/node-pty` for its pseudoterminal. It ships prebuilt binaries
for each platform and runs no install scripts, so nothing is compiled at install time
and no build toolchain (gcc, make, python, node-gyp) is needed.

### Deno / Bun status

Currently unsupported, as `node-pty` cannot be used there.

## Managing your Node version

The best way to manage your Node.js version is [fnm](https://github.com/Schniz/fnm):

```bash
curl -fsSL https://fnm.vercel.app/install | bash

fnm install 22
fnm use 22
fnm default 22
fnm list

node --version
```
