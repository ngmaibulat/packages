import cliTable from "cli-table3";
import color from "@colors/colors";
import { ParsedMail } from "mailparser";

function getSenderAddress(data: ParsedMail): string {
    return data.from?.value[0].address || "";
}

function getRcptAddress(data: ParsedMail): string {
    if (!data.to) {
        return "";
    }

    if (Array.isArray(data.to)) {
        const val = data.to[0].value[0].address as string;
        return val;
    }

    return data.to.value[0].address as string;
}

export function tableEmails(data: ParsedMail[]): string {
    const table = new cliTable({
        head: [
            color.green("Date"),
            color.green("From"),
            color.green("To"),
            color.green("Subject"),
            color.green("Attach#"),
        ],
        colWidths: [36, 40, 25, 40, 10],
    });

    for (const row of data) {
        const attachCount = row.attachments.length;
        const from = getSenderAddress(row);
        const to = getRcptAddress(row);

        const arr = [
            color.green(row.date?.toString() || ""),
            color.yellow(from),
            color.yellow(to),
            color.yellow(row.subject || ""),
            color.yellow(attachCount.toString()),
        ];
        table.push(arr);
    }

    return table.toString();
}
