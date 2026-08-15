# @aibulat/fs

Filesystem helpers, usable as a library or through the `fs` command. Directory
listings carry owner, group and detected file type alongside the usual stat
fields.

## Install

```bash
npm install @aibulat/fs        # library
npm install -g @aibulat/fs     # the `fs` command
```

## Command line

```bash
fs ls -d /var/log          # listing with owner, group, type, size, mode
fs hashes -d ./downloads   # MD5 and SHA-256 per file — resource intensive
fs help-chmod              # explain the rwx bits
```

`fs help-chmod` also takes `-f cli|html|markdown`.

## Library

```ts
import { isDir, lsDir, countDir, getFileType, hashMD5 } from "@aibulat/fs";

await isDir("./src"); // true
await countDir("./queue"); // number of entries
await lsDir("./src", true); // absolute paths, files only
getFileType("package.json"); // "JSON text data"
```

### Exports

| Export                          | Purpose                                              |
| ------------------------------- | ---------------------------------------------------- |
| `isDir(path)`                   | directory predicate; throws on an empty argument      |
| `lsDir(dir, filesOnly?)`        | entry names, or absolute paths when `filesOnly`       |
| `countDir(dir, filesOnly?)`     | entry count — what `wdc` watches                      |
| `moveFile(src, dst)`            | rename, falling back to copy across devices           |
| `hashMD5` / `hashSHA256`        | stream a file through a digest                        |
| `readFile` / `readFileAsString` | read helpers                                          |
| `getFileType(path)`             | libmagic content sniffing                             |

Types `UserData`, `FileStat` and `DirContents` are exported as types.

## Platform notes

Two runtime dependencies constrain where this installs cleanly:

- **`posix`** is a native addon compiled at install time (it supplies
  `getgrnam` for group names). It needs a toolchain — make, a C++ compiler and
  python — and is allow-listed in the workspace's `allowBuilds`.
- **`@npcz/magic`** carries libmagic as WASM. `getFileType` initialises it at
  module load, so importing this package is not free.

libmagic's wording is version-dependent: the same JSON file reports
`JSON data` on older releases and `JSON text data` on newer ones. Match on a
substring rather than the exact phrase.
