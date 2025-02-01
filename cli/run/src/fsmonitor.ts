import chokidar from "chokidar";
import fs from "fs";

export class FSMonitor {
    private readonly path: string;
    private readonly extensions: string[];
    private readonly awaitWriteFinish: boolean;

    constructor(path: string, extensions: string[], awaitWriteFinish: boolean) {
        this.path = path;
        this.extensions = extensions;
        this.awaitWriteFinish = awaitWriteFinish;
    }

    public watch() {
        const watcher = chokidar.watch(this.path, {
            ignoreInitial: true,
            ignored: this.isIgnored.bind(this),
            awaitWriteFinish: this.awaitWriteFinish,
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
    }

    private isIgnored(path: string, stats: fs.Stats | undefined): boolean {
        if (!stats) {
            return false;
        }

        if (stats.isDirectory()) {
            return false;
        }

        if (!stats.isFile()) {
            return true;
        }

        if (this.extensions.length) {
            const monitor = this.extensions.some((ext) => path.endsWith(ext));
            return !monitor;
        }

        return false;
    }
}
