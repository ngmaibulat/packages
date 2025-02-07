export type LogRecord = {
    id: number;
    dt: string;
    cwd: string;
    cmd: string;
    args: string;
    envfile: string;
    rc: number;
    output: string;
};
