#!/usr/bin/env -S node --no-warnings

// The published bin runs under plain node, so zx's globals ($, chalk, echo,
// os, ...) have to be imported rather than supplied by the interpreter.
import "zx/globals";

// zx 8 defaults $.verbose to false. This script exists to show the output of
// the apt/ufw commands it drives, which is what zx 7 did by default.
$.verbose = true;

import fs from "node:fs";

function isRoot() {
    if (typeof process.getuid != "function") {
        return false;
    }

    const uid = process.getuid();

    if (uid) {
        return false;
    }

    return true;
}

function isFile(path: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        fs.stat(path, (err, stat) => {
            if (err) {
                if (err.code === "ENOENT") {
                    resolve(false);
                } else {
                    reject(err);
                }
            } else {
                resolve(stat.isFile());
            }
        });
    });
}

const msg = `
The script will setup ufw according to rules from json file.
The firewall would be enable and default inbound which is
NOT specifically Allowed -- will be blocked!
`;

console.log("");
console.log(chalk.yellowBright(msg));
console.log("");

const root = isRoot();

if (!root) {
    const msg = chalk.red("This program must be run via sudo\n");
    console.error(msg);
    process.exit(1);
}

//get policy path from argv
if (!argv._.length) {
    const errmsg = chalk.red("Policy filename is required\n");
    const help = chalk.greenBright("example: ctl-ufw fw.json\n");
    console.error(errmsg);
    console.log(help);
    process.exit(1);
}

const path = argv._[0];
const fileExists = await isFile(path);

//check if files exists
if (!fileExists) {
    const errmsg = chalk.red(`file not found: ${path}\n`);
    console.log(errmsg);
    process.exit(1);
}

let content = "";
try {
    content = fs.readFileSync(path, "utf-8");
} catch (err) {
    const errmsg = `Cannot read file: ${path}`;
    process.exit(1);
}

//try json parse
let policy;
try {
    policy = JSON.parse(content);

    if (!Array.isArray(policy)) {
        const errmsg = chalk.red(`Data must be json array: ${path}\n`);
        console.log(errmsg);
        process.exit(1);
    }
} catch (err) {
    const errmsg = chalk.red(`Cannot parse JSON from file: ${path}\n`);
    console.log(errmsg);
    process.exit(1);
}

for (const item of policy) {
    if (typeof item != "number") {
        const errmsg = chalk.red(`Must be a number: ${item}\n`);
        console.log(errmsg);
        process.exit(1);
    }

    if (item < 1) {
        const errmsg = chalk.red(`Must be a positive number: ${item}\n`);
        console.log(errmsg);
        process.exit(1);
    }

    if (item > 65535) {
        const errmsg = chalk.red(`Maximum port number is 65535, got: ${item}\n`);
        console.log(errmsg);
        process.exit(1);
    }
}

console.log(chalk.greenBright("Going to allow ports:\n"));
console.log(policy);
console.log("\n");
//check json structure via zod

//install ufw
await $`apt install ufw`;
console.log("");

//add rules
for (const port of policy) {
    await $`ufw allow ${port}`;
    console.log("");
}

//add default rule
await $`ufw default deny`;
console.log("");

//enable ufw
await $`ufw enable`;
console.log("");

//show version
await $`ufw version`;
console.log("");

//show status
await $`ufw status`;
console.log("");
