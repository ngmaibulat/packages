import isFile from "@aibulat/isfile";

import { readHQueueFile } from "../haraka/hqueue.js";

import type { viewOptions } from "../types.js";

export async function actionHView(options: viewOptions) {
    const found = await isFile(options.file);

    if (!found) {
        console.error(`File not found: ${options.file}`);
        process.exit(1);
    }

    const res = readHQueueFile(options.file);
    console.log(res);
}
