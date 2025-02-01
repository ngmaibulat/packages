#!/usr/bin/env node

import { existsSync } from "node:fs";
import { Command } from "commander";
import { run, runMultiple, runForever } from "./lib.js";
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
        .option("-r, --runs <count>", "run the command multiple times")
        .option("-p, --pause <seconds>", "pause between runs")
        .argument("<exe>", "executable to run")
        .argument("[args...]", "arguments for the executable")
        .allowUnknownOption(true);

    program.parse(process.argv);
    const options = program.opts();
    const [exe, ...args] = program.args;

    let forever = false;
    let runs = 1;
    let pause = 0;
    let cmd = [];

    if (options.runs) {
        const tmp = parseInt(options.runs);
        if (tmp === 0) {
            forever = true;
        }

        if (tmp > 1) {
            runs = tmp;
        }
    }

    if (options.pause) {
        const tmp = parseInt(options.pause);
        if (tmp > 0) {
            pause = tmp;
        }
    }

    if (options.debug) {
        console.log("Options:", options);
        console.log("Executable:", exe);
        console.log("Arguments:", args);
        console.log("\n\n");
    }

    if (options.envFile) {
        const exists = existsSync(options.envFile);

        if (!exists) {
            const msg = "\nSpecified env file does not exists:";
            console.error(msg, options.envFile);
            process.exit(1);
        }

        if (forever) {
            await runForever(exe, args, options.clean, options.envFile, pause);
        } else {
            cmd = await runMultiple(
                exe,
                args,
                options.clean,
                options.envFile,
                runs,
                pause,
            );
        }
    } else {
        if (forever) {
            await runForever(exe, args, options.clean, options.envFile, pause);
        } else {
            cmd = await runMultiple(exe, args, options.clean, "", runs, pause);
        }
    }
    // console.log(cmd);
}

main();
