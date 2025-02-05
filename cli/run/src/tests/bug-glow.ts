#!/bin/env node

import { VT } from "@/vt";

const cmd = "glow";

//create vt
const vt = new VT();

//run process
await vt.spawn(cmd, []);

//get output
const out = vt.output();
