# API

The package can be used as a library as well as a CLI.

```typescript
import { run } from "@aibulat/run";

const program = "ls";
const args = ["-l", "-a"];
const cmd = run(program, args);
```

## Function signature

```typescript
run(cmd: string, args: string[], clean: boolean, envfile: string)
```

- `cmd` — program to run
- `args` — program arguments
- `clean` — clean up all env vars except `PATH`, `HOME` and `SHELL` before loading the
  env file
- `envfile` — env file to load. If not specified, `.env` in the current directory is
  loaded when present.
