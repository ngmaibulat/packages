import type { Stats } from "node:fs";

export type Events = "create" | "change" | "delete" | "all";

export const possibleEvents: Events[] = ["create", "change", "delete", "all"];

/** Only the parts of fs.Stats used for placeholder substitution. */
export type StatsLike = Pick<Stats, "size" | "mtime">;

export function getExtensions(ext: string | undefined): string[] {
    if (ext) {
        return ext.split(",");
    }

    return [];
}

/**
 * Parse the --monevents list.
 *
 * Throws on an unknown event; the CLI turns that into a message and exit(1).
 */
export function getEvents(events: string | undefined): Events[] {
    if (!events) {
        return ["all"];
    }

    const list = events.split(",");

    for (const ev of list) {
        const allowed = possibleEvents.includes(ev as Events);

        if (!allowed) {
            throw new Error(`Invalid event: ${ev}`);
        }
    }

    return list as Events[];
}

/** Substitute %path, %size and %mtime into the wrapped command's args. */
export function replaceArgs(
    args: string[],
    path: string,
    stats: StatsLike | undefined
): string[] {
    const newargs = [];

    for (const arg of args) {
        let narg = arg.replaceAll("%path", path);

        if (stats) {
            narg = narg.replaceAll("%size", stats.size.toString());
            narg = narg.replaceAll("%mtime", stats.mtime.toString());
        }

        newargs.push(narg);
    }

    return newargs;
}
