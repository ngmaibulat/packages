### Watch-Dir-Count

Watch count of files in a directory and

-   run specified script
-   send email report

### Install

```bash
npm install -g @aibulat/watch-dir-count
mkdir log
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

Filename: `log.cfg.json`

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
