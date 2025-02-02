#!/usr/bin/env node

import type { Stats } from "node:fs";

import { existsSync } from "node:fs";
import { Command } from "commander";
import { FSMonitor } from "./fsmonitor.js";
import { run, runMultiple, runForever } from "./lib.js";

import packageJson from "$/package.json" with { type: "json" };

type Events = "create" | "change" | "delete" | "all";

interface ProgramOptions {
    envFile?: string;
    clean?: boolean;
    debug?: boolean;
    runs?: string;
    pause?: string;
    monpath?: string;
    monext?: string;
    monevents?: string;
}

function getExtensions(ext: string | undefined) {
    if (ext) {
        return ext.split(",");
    }

    return [];
}

function getEvents(events: string  | undefined): Events[] {
    if (!events) {
        return ["all"];
    }

    const list = events.split(",");
    const possibleEvents: Events[] = ["create", "change", "delete", "all"];

    for (const ev of list) {
        const allowed = possibleEvents.includes(ev as Events);
        if (!allowed) {
            const msg = `Invalid event: ${ev}`;
            console.error(msg);
            process.exit(1);
        }
    }

    return list as Events[];
}

function replaceArgs(args: string[], path: string, stats: Stats | undefined) {
    const newargs = [];

    for (const arg of args) {
        let narg = arg.replaceAll("%path", path);

        if (stats) {
            narg = narg.replaceAll("%size", stats.size.toString())
            narg = narg.replaceAll("%mtime", stats.mtime.toString())
        }

        newargs.push(narg);
    }

    return newargs;
}

async function runStandard(exe: string, args: string[], options: ProgramOptions) {
    let forever = false;
    let runs = 1;
    let pause = 0;
    let cmd = [];

    if (options.runs) {
        const tmp = Number.parseInt(options.runs);
        if (tmp === 0) {
            forever = true;
        }

        if (tmp > 1) {
            runs = tmp;
        }
    }

    if (options.pause) {
        const tmp = Number.parseInt(options.pause);
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

    let envFile = "";

    if (options.envFile) {
        const exists = existsSync(options.envFile);

        if (!exists) {
            const msg = "\nSpecified env file does not exists:";
            console.error(msg, options.envFile);
            process.exit(1);
        }

        envFile = options.envFile;
    }

    if (forever) {
        await runForever(exe, args, options.clean, envFile, pause);
    } else {
        cmd = await runMultiple(exe, args, options.clean, envFile, runs, pause);
    }
    // console.log(cmd);
}

async function runMonitoring(exe: string, args: string[], options: ProgramOptions) {
    if (options.debug) {
        console.log("Options:", options);
        console.log("Executable:", exe);
        console.log("Arguments:", args);

        console.log("Monitoring path:", options.monpath);
        console.log("Monitoring ext:", options.monext || "all");
        console.log("Monitoring events:", options.monevents || "all");

        console.log("\n\n");
    }

    let envFile = "";

    if (options.envFile) {
        const exists = existsSync(options.envFile);

        if (!exists) {
            const msg = "\nSpecified env file does not exists:";
            console.error(msg, options.envFile);
            process.exit(1);
        }

        envFile = options.envFile;
    }

    const path = options.monpath || ".";
    const extensions = getExtensions(options.monext);
    const events = getEvents(options.monevents);
    const awaitWriteFinish = true;

    const monitor = new FSMonitor(path, extensions, awaitWriteFinish);

    if (events.includes("all")) {
        monitor.setAllHandler(async (event, path) => {
            const nargs = replaceArgs(args, path, undefined);

            const msg = `\nevent: ${event} on path: ${path}, running: ${exe} with args: ${nargs}`;
            console.log(msg);

            await run(exe, nargs, options.clean, envFile);
        });
    } else {
        if (events.includes("create")) {
            monitor.on("add", async (path, stats) => {
                console.log(`Create Event: ${path}`);
                const nargs = replaceArgs(args, path, stats);
                await run(exe, nargs, options.clean, envFile);
            });
        }

        if (events.includes("change")) {
            monitor.on("change", async (path, stats) => {
                console.log(`Change Event: ${path}`);
                const nargs = replaceArgs(args, path, stats);
                await run(exe, nargs, options.clean, envFile);
            });
        }

        if (events.includes("delete")) {
            monitor.on("unlink", async (path, stats) => {
                console.log(`Delete Event: ${path}`);
                const nargs = replaceArgs(args, path, stats);
                await run(exe, nargs, options.clean, envFile);
            });
        }
    }

    monitor.watch();
}

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
        .option(
            "--monpath <path>",
            "monitor path, run on fs change. --runs and --pause are ignored",
        )
        .option("--monext <ext>", "file extensions to monitor")
        .option("--monevents <events>", "event list: create,change,delete,all")
        .argument("<exe>", "executable to run")
        .argument("[args...]", "arguments for the executable")
        .allowUnknownOption(true);

    program.parse(process.argv);
    const options = program.opts<ProgramOptions>();
    const [exe, ...args] = program.args;

    if (options.monpath) {
        runMonitoring(exe, args, options);
    } else {
        runStandard(exe, args, options);
    }
}

main();
