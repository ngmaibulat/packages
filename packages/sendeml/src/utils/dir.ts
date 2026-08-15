import fs from "node:fs/promises";
import type { PathLike } from "node:fs";
import path from "node:path";
import isFile from "@aibulat/isfile";

export async function isDir(dirname: string): Promise<boolean> {
    if (!dirname) {
        throw new Error("Invalid Argument");
    }

    try {
        const stats = await fs.stat(dirname);
        return stats.isDirectory();
    } catch (err: any) {
        if (err.code === "ENOENT") {
            return false;
        }
        throw err;
    }
}

export async function lsDir(dirname: string, filesOnly: boolean = false) {
    const found = await isDir(dirname);

    if (!found) {
        throw new Error(`Directory not found: ${dirname}`);
    }

    const files = await fs.readdir(dirname);

    if (filesOnly) {
        const res = [];

        for (const item of files) {
            const rpath = path.resolve(dirname, item);
            const checked = await isFile(rpath);
            if (checked) {
                res.push(rpath);
            }
        }

        return res;
    }

    return files;
}

export async function moveFile(src: PathLike, dst: PathLike): Promise<boolean> {
    try {
        await fs.rename(src, dst);
        return true;
    } catch (err: any) {
        return false;
    }
}
