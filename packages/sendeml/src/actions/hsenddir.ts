import path from "node:path";
import { isDir, lsDir, moveFile } from "../utils/dir.js";

import { sendEml } from "../smtp.js";

import { readHQueueFile } from "../haraka/hqueue.js";

import type { pingOptions, sendOptions, lsOptions, sendDirOptions, viewOptions } from "../types.js";

export async function actionHSendDir(options: sendDirOptions) {
    const dirFound = await isDir(options.dir);

    if (!dirFound) {
        console.error(`Dir not found: ${options.dir}`);
        process.exit(1);
    }

    const files = await lsDir(options.dir, true);

    let filesToProcess = [];

    if (options.max) {
        filesToProcess = files.slice(0, options.max);
    } else {
        filesToProcess = files;
    }

    // console.log(files);
    // console.log(filesToProcess);

    for (const item of filesToProcess) {
        const res = readHQueueFile(item);
        await sendEml(res.eml, res.sender, res.recipients);
        console.log(`Sent: ${item}`);

        const basename = path.basename(item);
        const newPath = path.resolve(options.moveDest, basename);

        const moved = await moveFile(item, newPath);

        if (!moved) {
            console.error(`Could not move file: ${basename}`);
        }
    }
}
