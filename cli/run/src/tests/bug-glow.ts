#!/bin/env node

import { VT } from "@/vt";

const cmd = "glow";

//create vt
const vt = new VT();

//run process
await vt.spawn(cmd, ["one.md"]);
// await vt.spawn(cmd, ["-c", "1", "google.com"]);

//get output
const out = vt.output();

console.log(out);
