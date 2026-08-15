#!/usr/bin/env node

import isFile from "@aibulat/isfile";
import { convertFile } from "./lib";

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

const converted = await convertFile(path);
console.log(converted);

// other option
// read stdin
// convert via anser
// output
