# @aibulat/watch-dir-count

Poll a directory's file count on an interval. When the count crosses a
threshold, run a command and send an email report. The `wdc` bin is the whole
interface — a mail-queue depth alarm, in practice.

## Install

```bash
npm install -g @aibulat/watch-dir-count
```

## Run

```bash
mkdir log        # the bunyan streams in log.cfg.json must have a directory
wdc
```

`wdc` loops until interrupted. Each tick prints the count in green, or in red
with the command and email fired, when the threshold is crossed.

## Configuration

### `.env`

```bash
INTERVAL="60"     # seconds; values below 1 are clamped
THRESHOLD="100"   # count that triggers the script and the email
DIR="/var/queue"  # directory to watch
EXEC="echo {{dir}} {{count}}"   # {{dir}} and {{count}} are substituted

EMAIL_TEMPLATE="./templates/default.eml"  # optional; see below
EMAIL_FROM="wdc@example.com"
EMAIL_TO="to@example.com,another@example.com"
EMAIL_SUBJECT="Queue Report"

SMTP_HOST="smtp.example.com"
SMTP_PORT="25"
SMTP_USER=""
SMTP_PASS=""
```

`EMAIL_TEMPLATE` is optional. Left unset, the bundled `templates/default.eml`
is used — resolved relative to the installed package, so it works from any
working directory. Set it only to point at a template of your own.

Handlebars fills `from`, `to`, `subject`, `directory`, `numFiles`, `date`,
`execStr` and `retcode`.

### `log.cfg.json`

Passed straight to [bunyan](https://github.com/trentm/node-bunyan) as its
logger options, and read from the working directory:

```json
{
    "name": "wdc",
    "streams": [
        { "level": "debug", "path": "./log/debug.json" },
        { "level": "info", "path": "./log/logs.json" }
    ]
}
```

The directories named in `path` must already exist — bunyan does not create
them, and the process exits on the resulting `ENOENT`.

## Failure behaviour

The command and the email are independent: a non-zero exit from `EXEC` is
reported and the email still goes out, and an SMTP failure is logged without
stopping the loop.
