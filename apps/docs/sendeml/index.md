# @aibulat/sendeml

Send raw `.eml` files to an SMTP server — one file, a directory, or a
[Haraka](https://haraka.github.io/) queue directory, which has its own binary
envelope format that this reads directly.

## Install

```bash
sudo npm i -g @aibulat/sendeml
```

Or without installing:

```bash
npx @aibulat/sendeml@latest -h
```

## Configuration

A `.env` in the working directory, or the same variables in the environment:

```bash
SMTP_HOST="smtp-server"
SMTP_PORT="25"
SMTP_USER=""
SMTP_PASS=""

LOG_DIR="./log"
LOG_LEVEL="info"
```

Leave `SMTP_USER` and `SMTP_PASS` empty for an unauthenticated relay.

## Commands

```
ping [options]      Test SMTP server by sending a generated message
send [options]      Send eml file
senddir [options]   Send eml files from a dir
hsenddir [options]  Send eml files from a Haraka Queue dir
hview [options]     View file from Haraka Queue dir
ls [options]        List eml files in a dir
help [command]      display help for command
```

Every sending command takes `-s/--sender` and `-r/--rcpt`, and `--debug` to
print the SMTP conversation.

## Examples

```bash
# prove the relay works before touching a real queue
sendeml ping -s me@example.com -r you@example.com --debug

# one file
sendeml send -s me@example.com -r you@example.com -f message.eml

# drain a Haraka queue, at most 2 messages, moving each one aside as it goes
sendeml hsenddir -d ./queue/haraka --max 2 --moveDest ./queue/moved

# look before sending
sendeml ls -d ./queue
sendeml hview -f ./queue/haraka/1699999999999_0_1_1
```

`--moveDest` is what makes `hsenddir` re-runnable: a delivered message leaves
the source directory, so an interrupted run resumes rather than double-sending.

## Status

Parts of this package are mid-restructure — `src/mailsend/` duplicates
`src/smtp.ts`, and the filter, signing and encryption directories are
placeholders. The commands listed above work; the rest is scaffolding.

## Test corpus

`getsamples.sh` downloads a public spam corpus into `./queue` for manual
testing. It is not part of the test suite, which is hermetic.
