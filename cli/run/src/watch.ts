#!/usr/bin/env bun

import { FSMonitor } from "./fsmonitor.js";

const path = "./src";
const extensions = [".ts", ".js"];
const awaitWriteFinish = true;

const monitor = new FSMonitor(path, extensions, awaitWriteFinish);
monitor.watch();
