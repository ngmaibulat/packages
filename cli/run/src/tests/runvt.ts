#!/bin/env node

import { runVT } from "../librun";

const cmd = "glow";
const args = ["one.md"];
await runVT(cmd, args);
