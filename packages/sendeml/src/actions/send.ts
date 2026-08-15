import isFile from "@aibulat/isfile";
import { sendEmlFile, smtpPing } from "../smtp.js";
import type { pingOptions, sendOptions, lsOptions, sendDirOptions, viewOptions } from "../types.js";

export async function actionSend(options: sendOptions) {
    console.log(options);
    console.log(options.sender);
    console.log(options.rcpt);
    const fileFound = await isFile(options.file);

    if (!fileFound) {
        console.error(`File not found: ${options.file}`);
        process.exit(1);
    }

    await sendEmlFile(options.file, options.sender, [options.rcpt]);
}
