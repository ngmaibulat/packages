#!/bin/env node

import fs from "node:fs/promises";
import isFile from "@aibulat/isfile";
import Anser from "anser";

const argsCount = process.argv.length;

if (argsCount < 3) {
    console.log("Usage: naser <filename>");
    process.exit(1);
}

const path = process.argv[2];
const exists = await isFile(path);

if (!exists) {
    console.log("File Not Found", path);
    process.exit(2);
}

const content = await fs.readFile(path, { encoding: "utf-8" });
console.log(content);

const converted = Anser.ansiToHtml(content);
console.log(converted);

// other option
// read stdin
// convert via anser
// output
