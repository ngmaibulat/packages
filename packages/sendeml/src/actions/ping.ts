import { smtpPing } from "../smtp.js";

import type { pingOptions } from "../types.js";

export async function actionPing(options: pingOptions) {
    // console.log(options);
    // console.log(options.sender);
    // console.log(options.rcpt);

    const res = await smtpPing(options);
    console.log(res);
}
