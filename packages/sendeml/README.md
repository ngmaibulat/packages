### SendEml

Send raw eml files to SMTP server specified via env vars or .env file

### Install

```bash
sudo npm i -g @aibulat/sendeml
```

### Run via npx

```bash
npx @aibulat/sendeml@latest -h
```

### Use

create .env file:

```bash
SMTP_HOST="smtp-server"
SMTP_PORT="25"
SMTP_USER=""
SMTP_PASS=""

LOG_DIR="./log"
LOG_LEVEL="info"
```

```
sendeml hsenddir -d ./queue/haraka --max 2 --moveDest ./queue/moved
```

### Commands:

```
Commands:
  ping [options]      Test SMTP server by sending a generated message
  send [options]      Send eml file
  senddir [options]   Send eml files from a dir
  hsenddir [options]  Send eml files from a Haraka Queue dir
  hview [options]     View file from Haraka Queue dir
  ls [options]        List eml files in a dir
  help [command]      display help for command
```
