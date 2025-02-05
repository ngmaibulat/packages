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
        cwd = process.cwd(),
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
                    // DSR - Device Status Report
                    // \x1B[6n -- DSR that requests cursor position

                    //fix for glow command
                    //which requests current cursor position
                    //and node-pty does not seem to be to handle this
                    //and glow end up with waiting until timeout is reached
                    //so, we don't want to have that slowness
                    //and report cursor position ourselves

                    //Also, we don't want that DSR to be in output
                    //So, we don't push it to the Output
                    //So, we return after handling DSR

                    const dsr = "\x1B[6n";

                    if (data.includes(dsr)) {
                        const position = "\x1B[1;1R"; // report position 1;1
                        this.ptyProcess?.write(position);
                        return;
                    }

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
        const out = this.buffer.join("");
        return out;
    }

    sleep(ms: number) {
        return new Promise((resolve, reject) => {
            setTimeout(resolve, ms);
        });
    }
}
