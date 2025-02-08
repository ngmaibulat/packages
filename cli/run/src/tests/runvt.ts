#!/bin/env node

import { runVT } from "../librun";

const uuid = crypto.randomUUID();
const cmd = "glow";
const args = ["one.md"];
await runVT(cmd, args, "out.txt", uuid);
