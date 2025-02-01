#!/usr/bin/env bun

import chokidar from "chokidar";

// Watch specific patterns
const watcher = chokidar.watch(
    [
        "*.js", // All JavaScript files
        "*.ts", // All TypeScript files
        "src/**/*.{js,ts}", // All JS/TS files in src directory and subdirectories
    ],
    {
        ignored: /hello.js/,
        persistent: true,
    },
);

watcher.on("all", (event, path) => {
    console.log(event, path);
});
