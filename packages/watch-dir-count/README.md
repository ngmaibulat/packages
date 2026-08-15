### Watch-Dir-Count

Watch count of files in a directory and

-   run specified script
-   send email report

### Install

```bash
npm install -g @aibulat/watch-dir-count
git clone git@github.com:ngmaibulat/email-templates-wdc.git
# create .env
# create log.cfg.json
wdc
```

### Dotenv file

Filename: `.env`

Example:

```bash
INTERVAL="60"     #seconds
THRESHOLD="100"   #count of items to trigger script/email
DIR="/var/queue"  #dir to watch
EXEC="echo {{dir}} {{count}}"  #script to execute

EMAIL_TEMPLATE="./templates/default.eml"  # path to email templates, adjust if needed/customized
EMAIL_FROM="wdc@example.com"
EMAIL_TO="to@example.com,another@example.com"
EMAIL_SUBJECT="Queue Report"

SMTP_HOST="smtp.example.com"
SMTP_PORT="25"
SMTP_USER=""
SMTP_PASS=""
```

### Logger configuration

Filename: `log.cfg.json`, read from the working directory. The schema is the one
bunyan used; the logger is [pino](https://getpino.io) now, and the file is
translated into one destination per stream. Directories named in `path` are
created if missing, `level` accepts the names below or bunyan's numbers, and
`"type": "rotating-file"` is rejected — use `logrotate`.

Example:

```json
{
    "name": "wdc",
    "streams": [
        {
            "level": "debug",
            "path": "./log/debug.json"
        },
        {
            "level": "info",
            "path": "./log/logs.json"
        }
    ]
}
```
