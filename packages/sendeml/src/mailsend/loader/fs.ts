import path from "node:path";

import { isDir, lsDir, moveFile } from "../../utils/dir.js";

export async function* aiLsDir(dirname: string, max: number = 1000) {
    const dirFound = await isDir(dirname);

    if (!dirFound) {
        const msg = `Dir not found: ${dirname}`;
        throw new Error(msg);
    }

    const files = await lsDir(dirname, true);

    let filesToProcess = [];

    if (max) {
        filesToProcess = files.slice(0, max);
    } else {
        filesToProcess = files;
    }

    for (const item of filesToProcess) {
        yield item; //actually readFile and yield the content!
    }
}

export async function* fsLoader(dirname: string, max: number = 1000) {
    const it = aiLsDir(dirname, max);
    for await (const elem of it) {
        console.log(elem);
        //read file
        //yield file as string
    }
}
