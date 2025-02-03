import * as pty from "node-pty";

export class VT {
    name: string;
    cols: number;
    rows: number;
    cwd: string;
    env: NodeJS.ProcessEnv;
    ptyProcess: pty.IPty | null = null;
    buffer: string[] = [];
    running = false;

    constructor(
        name = "xterm-color",
        cols = 80,
        rows = 40,
        cwd = process.env.HOME,
        env = process.env
    ) {
        this.name = name;
        this.cols = cols;
        this.rows = rows;
        this.cwd = cwd || ".";
        this.env = env;
    }

    spawn(cmd: string, args: string[]) {
        this.running = true;

        return new Promise<void>((resolve, reject) => {
            try {
                this.ptyProcess = pty.spawn(cmd, args, {
                    name: this.name,
                    cols: this.cols,
                    rows: this.rows,
                    cwd: this.cwd,
                    env: this.env,
                });

                this.ptyProcess.onData((data) => {
                    // appendFileSync("out.txt", data, "utf8");
                    this.buffer.push(data);
                });

                this.ptyProcess.onExit(async () => {
                    this.running = false;
                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    output() {
        const out = this.buffer.join();
        return out;
    }

    sleep(ms: number) {
        return new Promise((resolve, reject) => {
            setTimeout(resolve, ms);
        });
    }
}
