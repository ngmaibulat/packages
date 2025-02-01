### @aibulat/run

Run a Process with specified ENV vars loaded.
By default, it tries to load .env file from the current directory.
Another env file can be specified with `-e` option.
If another file specified - it must exist.

### Use as CLI with npx

1. `npx @aibulat/run --version`
1. `npx @aibulat/run --help`
1. `npx @aibulat/run <cmd>`
1. `npx @aibulat/run -e some-env-file <cmd>`

### Use with Bun

1. `curl -fsSL https://bun.sh/install | bash`
1. `bun upgrade`
1. `bun --version`
1. `bun install -g @aibulat/run`
1. `run --version`
1. `run --help`
1. `run <cmd>`
1. `run -e some-env-file <cmd>`

### CLI samples:

```sh
run env
run ls -la
run cat package.json
run bash
run htop
run node somescript.js
run -e file.env mysql -uroot -p
```

### Use API

```typescript
import { run } from "@aibulat/run";

const program = "ls";
const args = ["-l", "-a"];
const cmd = run(program, args);
```

### Function Signature

```typescript
run(program: string, args: string[]): Promise<ChildProcess>
```

### CJS is not supported

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "ES2022",
    "moduleResolution": "nodenext"
  }
}
```

`package.json`:

```json
{
  "type": "module"
}
```
