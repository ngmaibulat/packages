import type { LogRecord } from "@/types";

export class WebLog {
    private url;

    constructor(url: string) {
        this.url = url;
    }

    async insertLog(
        cwd: string,
        cmd: string,
        args: string[],
        output: string,
        envfile: string,
        rc: number
    ) {
        const argsJson = JSON.stringify(args);

        const body = {
            cwd,
            cmd,
            args: argsJson,
            env: envfile,
            rc,
            output,
        };

        const fetchOptions = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        };

        const res = await fetch(this.url, fetchOptions);

        console.log(res);
    }

    getLogs() {
        console.log("Not Implemented");
        return [] as LogRecord[];
    }

    getOne(id: number) {
        console.log("Not Implemented");
        return {} as LogRecord;
    }
}
