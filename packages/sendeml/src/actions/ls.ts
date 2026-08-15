import { tableEmails } from "../table.js";
import { parseEmlDir, sendEml } from "../smtp.js";

import type { lsOptions } from "../types.js";

export async function actionLs(options: lsOptions) {
    // console.log(options);
    const data = await parseEmlDir(options.dir);
    const output = tableEmails(data);
    console.log(output);
}
