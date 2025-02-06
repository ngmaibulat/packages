#!/bin/env -S node --no-warnings

import readline from "node:readline";
import { runShell } from "./shell/lib";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

console.log('Type "exit" to quit.');
const prompt = "> ";

while (true) {
    await runShell(rl, prompt);
}
