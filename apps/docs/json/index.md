# @aibulat/json

Read a JSON file and get back a typed value instead of `any`. The type parameter
is the shape you expect; nothing is validated at runtime, so this buys you
editor support rather than safety.

A missing file throws with the path in the message, because
[`@aibulat/isfile`](/isfile/) is consulted before the read.

## Install

```bash
npm install @aibulat/json
```

## Signature

```ts
function readJson<T>(path: string): Promise<T>;
```

## Use

Given `user.json`:

```json
{
  "name": "Aibulat",
  "email": "aibulat@example.com",
  "position": "NodeJS Developer"
}
```

```ts
import { readJson } from "@aibulat/json";

interface User {
    name: string;
    email: string;
    position: string;
}

const data = await readJson<User>("user.json");

console.log(data.name);
console.log(data.email);
console.log(data.position);
```

## Errors

- **File does not exist** — throws `file <path> does not exist`.
- **Malformed JSON** — the `JSON.parse` error propagates unchanged.
