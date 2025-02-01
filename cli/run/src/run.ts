#!/usr/bin/env node

import { existsSync } from "node:fs";
import { Command } from "commander";
import { run } from "./lib.js";
import packageJson from "$/package.json" with { type: "json" };

async function main() {
    const program = new Command();
    const desc = "Run programs with environment variables preloaded from file";

    program
        .name("run")
        .description(desc)
        .version(packageJson.version)
        .option("-e, --env-file <path>", "path to .env file")
        .option(
            "-c, --clean",
            "before loading .env file, clean all environment variables except PATH, HOME, SHELL",
        )
        .option("-d, --debug", "output extra debugging")
        .argument("<exe>", "executable to run")
        .argument("[args...]", "arguments for the executable")
        .allowUnknownOption(true);

    program.parse(process.argv);
    const options = program.opts();
    const [exe, ...args] = program.args;

    if (options.debug) {
        console.log("Options:", options);
        console.log("Executable:", exe);
        console.log("Arguments:", args);
        console.log("\n\n");
    }

    let cmd = null;

    if (options.envFile) {
        const exists = existsSync(options.envFile);

        if (!exists) {
            const msg = "\nSpecified env file does not exists:";
            console.error(msg, options.envFile);
            process.exit(1);
        }

        cmd = await run(exe, args, options.clean, options.envFile);
    } else {
        cmd = await run(exe, args, options.clean);
    }

    // console.log(cmd);
}

main();
