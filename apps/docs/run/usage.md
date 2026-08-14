# Usage

## Help

```
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

## Caution

The command you run might have options that contradict `run`'s own. In that case put a
`--` separator between the options for `run` and the command.

```bash
run -r 2 -- lsd -l
```

## Examples

```bash
run env
run ls -la
run cat package.json
run bash
run node somescript.js
run -e file.env mysql -uroot -p
```

## Repeating runs

Run a command multiple times with `-r`. `-r 0` repeats infinitely. Pauses between runs
are set with `-p <seconds>`.

```bash
# repeat infinitely, 1 second pause between runs
run -r 0 -p 1 ls -la

# run 5 times, 2 second pause between runs
run -r 5 -p 2 ls -la
```

## File monitoring

Instead of repeating, runs can be driven by filesystem events. Specify the monitored
path, the file extensions and the event types. In this mode `-r` and `-p` are ignored.

```bash
run --monpath . --monext ts,js,css --monevents create lsd -l
run --monpath . --monext ts,js,css --monevents all lsd -l
run --monpath ./src ls -l
```

When running by fs events you can use the `%path` variable among the command args — it
is replaced with the actual path.

```bash
run --monpath . --monevents change echo %path
```

See [chokidar event types](/notes/chokidar-event-types) for the underlying events.

## Logs

Logs are written to `$HOME/.local/state/ngm/logs`. Use `--logs` to print the actual log
directory.

```bash
run --logs
```

### Viewing logs

The package includes the `logview` utility to render the log table, and `output <id>`
to print the captured output of a single run.

```bash
logview
output 42
```
