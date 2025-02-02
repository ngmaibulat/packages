import chokidar from "chokidar";
import fs from "fs";

export type FSMonitorEvent = "add" | "change" | "unlink";

export type FSMonitorHandler = (path: string, stats: fs.Stats) => void;
export type FSMonitorAllHandler = (event: string, path: string) => void;
export type FSMonitorErrorHandler = (error: any) => void;

export class FSMonitor {
    private readonly path: string;
    private readonly extensions: string[];
    private readonly awaitWriteFinish: boolean;
    private handlers: { [event: string]: Function } = {};
    private errorHandler: Function | null = null;
    private allHandler: Function | null = null;

    static events = ["add", "change", "unlink"];

    constructor(path: string, extensions: string[], awaitWriteFinish: boolean) {
        this.path = path;
        this.extensions = extensions;
        this.awaitWriteFinish = awaitWriteFinish;
    }

    setErrorHandler(handler: Function) {
        this.errorHandler = handler;
    }

    setAllHandler(handler: FSMonitorAllHandler) {
        this.allHandler = handler;
    }

    on(event: FSMonitorEvent, handler: FSMonitorHandler) {
        const validEvent = FSMonitor.events.includes(event);
        if (!validEvent) {
            throw new Error(`Invalid event: ${event}`);
        }

        this.handlers[event] = handler;
    }

    off(event: FSMonitorEvent) {
        delete this.handlers[event];
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

        watcher.on("error", (error) => {
            if (this.errorHandler) {
                this.errorHandler(error);
            }
        });

        watcher.on("all", (event, path) => {
            if (this.allHandler) {
                this.allHandler(event, path);
            }
        });

        watcher.on("change", (path, stats) => {
            const event = "change";

            if (this.handlers[event]) {
                this.handlers[event](path, stats);
            }
        });

        watcher.on("add", (path, stats) => {
            const event = "add";

            if (this.handlers[event]) {
                this.handlers[event](path, stats);
            }
        });

        watcher.on("unlink", (path, stats) => {
            const event = "unlink";

            if (this.handlers[event]) {
                this.handlers[event](path, stats);
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
