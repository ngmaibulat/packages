# Chokidar event types

## Main

| Event       | Meaning                |
| ----------- | ---------------------- |
| `add`       | File added             |
| `addDir`    | Directory added        |
| `change`    | File contents changed  |
| `unlink`    | File removed           |
| `unlinkDir` | Directory removed      |

## Other

| Event   | Meaning                                                |
| ------- | ------------------------------------------------------ |
| `ready` | Initial scan completed                                 |
| `raw`   | Raw event from the filesystem (usually not needed)      |
| `error` | Error occurred                                         |
| `all`   | Any of the above events (except `error`)               |
