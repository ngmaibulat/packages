#!/bin/env node

import { runVT } from "../librun";

const cmd = "lsd";
const args = ["-l", "-a"];
await runVT(cmd, args);
