#!/usr/bin/env bun

import chokidar from "chokidar";
import fs from "node:fs";

const path = "./src";
const extensions = [".ts", ".js"];
const awaitWriteFinish = true;

function isIgnored(path: string, stats: fs.Stats | undefined): boolean {
    if (!stats) {
        return false;
    }

    if (stats.isDirectory()) {
        return false;
    }

    if (!stats.isFile()) {
        return true;
    }

    if (extensions.length) {
        const monitor = extensions.some((ext) => path.endsWith(ext));
        return !monitor;
    }

    return false;
}

const watcher = chokidar.watch(path, {
    ignoreInitial: true,
    ignored: isIgnored,
    awaitWriteFinish,
    persistent: true,
    alwaysStat: true,
    depth: 100,
});

watcher.on("all", (event, path) => {
    console.log(event, path);
});

watcher.on("change", (path, stats) => {
    console.log(`File changed: ${path}`);

    if (stats) {
        console.log("File size:", stats.size);
        console.log("Last modified:", stats.mtime);
    }
});
