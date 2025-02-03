#!/usr/bin/env bun

import { FSMonitor } from "./fsmonitor";

//note: check tmp.ts

const path = "./src";
const extensions = [".ts", ".js"];
const awaitWriteFinish = true;

const monitor = new FSMonitor(path, extensions, awaitWriteFinish);

monitor.on("change", (path, stats) => {
    console.log(`File changed: ${path}`);

    if (stats) {
        // console.log(stats);
    }
});

monitor.on("add", (path, stats) => {
    console.log(`File added: ${path}`);

    if (stats) {
        console.log("File size:", stats.size);
        console.log("Last modified:", stats.mtime);
    }
});

monitor.on("unlink", (path, stats) => {
    console.log(`File removed: ${path}`);

    if (stats) {
        console.log("File size:", stats.size);
        console.log("Last modified:", stats.mtime);
    }
});

monitor.setAllHandler((event, path) => {
    console.log("All handler:", event, path);
});

monitor.watch();
