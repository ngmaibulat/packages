### Support

- NodeJS v22.5.0 and above
- Linux

### Deno/Bun Status

- Currently unsupported
- As we can't use node-pty there

### Run Process

- once
- multiple times
- infinitely
- on fs changes
- with specified pause between runs
- with specified env file
- with output logging

### Logs Location

- `$HOME/.local/state/ngm/logs`
- You can use `--logs` option to print actual logs directory

### Overview

Run a Process with specified ENV vars loaded.
By default, it tries to load .env file from the current directory.
Another env file can be specified with `-e` option.
If another file specified - it must exist.

You can run command multiple times by specifying `-r` option. For example,
`-r 4`. You can repeat running command infitely by specifying `-r 0`.
Pauses between command runs can be specified via `-p seconds`. Like: `run -r 4 -p 1 ls`

Another way to run commands, is filesystem events based. You can specify monitored path, file extensions
and event types.

When running by fs events, you can use `%path` variable among command args. It would be replaced with actual path.
Like: `run --monpath . --monevents change echo %path`

### Install

```bash
npm install -g @aibulat/run
run --version
```

### Help

```bash
Usage: run [options] [exe] [args...]

Run programs with environment variables preloaded from file

Arguments:
  exe                    executable to run
  args                   arguments for the executable

Options:
  -V, --version          output the version number
  -l, --logs             show log dir and exit
  -d, --debug            output extra debugging
  -e, --env-file <path>  path to .env file
  -c, --clean            before loading .env file, clean all environment variables except PATH, HOME, SHELL
  -r, --runs <count>     run the command multiple times
  -p, --pause <seconds>  pause between runs
  --monpath <path>       monitor path, run on fs change. --runs and --pause are ignored
  --monext <ext>         file extensions to monitor
  --monevents <events>   event list: create,change,delete,all
  -h, --help             display help for command
```

### Run command repeatedly/infitely, with a 1 second pause between runs

```bash
run -r 0 -p 1 ls -la
```

### Run command 5 times, with a 2 seconds pause between runs

```bash
run -r 5 -p 2 ls -la
```

### File Monitoring

```bash
run --monpath . --monext ts,js,css --monevents create lsd -l
run --monpath . --monext ts,js,css --monevents all lsd -l
run --monpath ./src ls -l
```

### Use as CLI with npx

1. `npx @aibulat/run --version`
1. `npx @aibulat/run --help`
1. `npx @aibulat/run <cmd>`
1. `npx @aibulat/run -e some-env-file <cmd>`

### CLI samples:

```sh
run env
run ls -la
run cat package.json
run bash
run htop
run node somescript.js
run -e file.env mysql -uroot -p
```

### Use API

```typescript
import { run } from "@aibulat/run";

const program = "ls";
const args = ["-l", "-a"];
const cmd = run(program, args);
```

### Function Signature

```typescript
run(cmd: string, args: string[], clean: boolean, envfile: string)
```

- cmd: program to run
- args: program arguments
- clean: flag to cleanup all ENV, except PATH, HOME, SHELL - before loading envfile
- envfile: env file to load. If not specified, we try to load .env in current directory
