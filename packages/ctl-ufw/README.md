### Info

- Tool to automatically configure ufw rules
- Must be run as root (eg via sudo)

### Input file

Create a file, with list of ports:

```json
[22, 443, 8080]
```

Save it. For example: fw.json

### Install

```bash
sudo npm i -g @aibulat/ctl-ufw
```

### Run

```
sudo ctl-ufw fw.json
```
