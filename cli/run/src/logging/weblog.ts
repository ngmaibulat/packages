import os from "node:os";
import type { LogRecord } from "@/types";

export class WebLog {
    private url;
    private userid;
    private username;

    constructor(url: string) {
        const userinfo = os.userInfo();
        this.userid = userinfo.uid;
        this.username = userinfo.username;
        this.url = url;
    }

    async insertLog(
        cwd: string,
        cmd: string,
        args: string[],
        env: string,
        rc: number,
        uuid: string
    ) {
        const argsJson = JSON.stringify(args);

        const body = {
            cwd,
            cmd,
            args: argsJson,
            env,
            rc,
            uuid,
            userid: this.userid,
            username: this.username,
        };

        const fetchOptions = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        };

        const url = `${this.url}/api/log`;

        try {
            await fetch(url, fetchOptions);
        } catch (err) {
            console.error("HTTP Error on URL:", url);
        }
    }

    async insertOutput(uuid: string, output: string) {
        const fetchOptions = {
            method: "POST",
            headers: {
                "Content-Type": "text/plain",
                uuid: uuid,
            },
            body: output,
        };

        const url = `${this.url}/api/output`;

        try {
            await fetch(url, fetchOptions);
        } catch (err) {
            console.error("HTTP Error on URL:", url);
        }
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
