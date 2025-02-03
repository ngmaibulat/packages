#!/usr/bin/env node

import { VT } from "./vt";

const vt = new VT();

console.log(vt);

await vt.spawn("lsd", ["-l"]);

const out = vt.output();

console.log(out);

console.log("hello");
