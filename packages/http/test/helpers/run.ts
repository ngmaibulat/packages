import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

/**
 * Tests run against `src/*.ts` by default -- Node strips the types, so no build is
 * needed for the inner loop. CI re-runs the same suite with HTTP_BIN_DIR=dist/bin so
 * the published artifact is what gets verified.
 */
const BIN_DIR = process.env.HTTP_BIN_DIR ?? 'src/bin';
const BIN_EXT = process.env.HTTP_BIN_EXT ?? '.ts';

export interface RunResult {
    code: number;
    stdout: string;
    stderr: string;
}

export interface RunOptions {
    stdin?: string | Buffer;
    env?: Record<string, string | undefined>;
    cwd?: string;
    /** Leave colour enabled; by default NO_COLOR is set so assertions stay readable. */
    color?: boolean;
}

export function binPath(name: string): string {
    return path.join(root, BIN_DIR, `${name}${BIN_EXT}`);
}

export function runBin(name: string, args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
    const env: Record<string, string | undefined> = {
        ...process.env,
        ...(options.color === true ? { FORCE_COLOR: '1' } : { NO_COLOR: '1' }),
        ...options.env,
    };

    if (options.color === true) delete env.NO_COLOR;

    return new Promise((resolve, reject) => {
        const child = execFile(
            process.execPath,
            [binPath(name), ...args],
            { env, cwd: options.cwd ?? root, maxBuffer: 32 * 1024 * 1024, encoding: 'buffer' },
            (err, stdout, stderr) => {
                const code =
                    err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === 'number'
                        ? ((err as unknown as { code: number }).code)
                        : err
                          ? 1
                          : 0;

                if (err && !('code' in err)) {
                    reject(err);
                    return;
                }

                resolve({ code, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') });
            },
        );

        if (options.stdin !== undefined) {
            child.stdin?.end(options.stdin);
        } else {
            // Close stdin so the CLI never waits on a pipe that will not deliver.
            child.stdin?.end();
        }
    });
}
