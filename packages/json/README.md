### JSON read file with types

If you are reading a json file, you might want to have
a good intellisense help from the IDE, availability of types.
That would make work easier compared to dealing with a plain Object.
Here is the example, how you can achieve this.

Having user.json:

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

### Function Signature:

```typescript
function readJson<T>(path: string): Promise<T>;
```
