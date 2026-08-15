import path from 'node:path';

import { parseArgv, type Options } from './args.ts';
import { createStyles, supportsColor, supportsFormatting } from './color.ts';
import { CliError, EXIT, formatError, type ExitCode } from './errors.ts';
import { renderHelp } from './help.ts';
import { runLink } from './link.ts';
import { renderRequestHead, renderResponse, renderTiming, type RenderContext } from './render.ts';
import { buildRequest, classifyAbort, createDeadline, send, type BuildDeps } from './request.ts';
import { promptPassword, readStdin } from './stdin.ts';
import { NAME, VERSION } from './version.ts';

export interface RunContext {
    invokedAs: string;
    fixedMethod: string | undefined;
}

function statusExitCode(status: number, checkStatus: boolean): ExitCode {
    if (!checkStatus) return EXIT.OK;
    if (status >= 500) return EXIT.STATUS_5XX;
    if (status >= 400) return EXIT.STATUS_4XX;
    if (status >= 300) return EXIT.STATUS_3XX;
    return EXIT.OK;
}

/** stdin can only be drained once, so share one read between method inference and the body. */
function memoizeStdin(): { read: () => Promise<Buffer | null> } {
    let pending: Promise<Buffer | null> | undefined;
    return {
        read: () => {
            pending ??= readStdin();
            return pending;
        },
    };
}

function buildRenderContext(options: Options): RenderContext {
    const stdoutIsTTY = process.stdout.isTTY === true;
    const color = supportsColor(options.flags.pretty, { isTTY: stdoutIsTTY, env: process.env });

    return {
        styles: createStyles(color),
        color,
        format: supportsFormatting(options.flags.pretty),
        print: options.flags.print,
        stdout: process.stdout,
        stderr: process.stderr,
    };
}

export async function run(argv: readonly string[], context: RunContext): Promise<ExitCode> {
    // `httpc link head patch` manages the opt-in shortcut bins; it is not a request.
    if (context.fixedMethod === undefined && (argv[0] === 'link' || argv[0] === 'unlink')) {
        return runLink(argv[0], argv.slice(1), process.stderr);
    }

    const stdinIsTTY = process.stdin.isTTY === true;
    const stdin = memoizeStdin();

    // The umbrella has to know whether anything was actually piped in before it can pick
    // a default method, so drain stdin up front in that one case. The shortcut bins know
    // their method already and read stdin lazily (or never, for GET and HEAD).
    const stdinHasData =
        context.fixedMethod === undefined && !stdinIsTTY ? ((await stdin.read())?.length ?? 0) > 0 : false;

    const parsed = parseArgv(argv, {
        invokedAs: context.invokedAs,
        fixedMethod: context.fixedMethod,
        stdoutIsTTY: process.stdout.isTTY === true,
        stdinIsTTY,
        stdinHasData,
    });

    if (parsed.kind !== 'run') {
        if (parsed.kind === 'help') {
            process.stdout.write(renderHelp(parsed.invokedAs, parsed.fixedMethod));
        } else {
            process.stdout.write(`${NAME} ${VERSION}\n`);
        }
        return EXIT.OK;
    }

    const options = parsed.options;

    if (options.deprecation !== undefined) {
        process.stderr.write(`${context.invokedAs}: warning: ${options.deprecation}\n`);
    }

    const deps: BuildDeps = {
        readStdin: stdin.read,
        promptPassword,
        stdinIsTTY,
    };

    const prepared = await buildRequest(options, deps);
    const ctx = buildRenderContext(options);

    if (options.flags.offline) {
        // Force the request head on: printing it is the entire point of --offline.
        renderRequestHead(prepared, { ...ctx, print: { ...ctx.print, reqHeaders: true, reqBody: true } });
        return EXIT.OK;
    }

    renderRequestHead(prepared, ctx);

    if (options.flags.insecure) {
        process.stderr.write(
            `${context.invokedAs}: warning: TLS verification is disabled for this process\n`,
        );
    }

    const deadline = createDeadline(options.flags.timeout);

    try {
        const result = await send(prepared, options, deadline);

        try {
            await renderResponse(result, { output: options.flags.output, download: options.flags.download }, ctx);
        } catch (err) {
            throw classifyAbort(err, deadline);
        }

        renderTiming(result, ctx);

        return statusExitCode(result.response.status, options.flags.checkStatus);
    } finally {
        deadline.clear();
    }
}

/**
 * Entry point shared by every bin. Never calls `process.exit` on the success path so
 * that stdout is flushed before the process ends.
 */
export async function main(fixedMethod?: string): Promise<void> {
    const argv1 = process.argv[1];
    const invokedAs = argv1 === undefined ? 'httpc' : path.basename(argv1, path.extname(argv1));

    try {
        process.exitCode = await run(process.argv.slice(2), { invokedAs, fixedMethod });
    } catch (err) {
        const { message, hint, code } = formatError(err);

        process.stderr.write(`${invokedAs}: ${message}\n`);
        if (hint !== undefined) process.stderr.write(`${invokedAs}: hint: ${hint}\n`);

        if (process.env.HTTP_DEBUG === '1' && err instanceof Error && !(err instanceof CliError)) {
            process.stderr.write(`${err.stack ?? ''}\n`);
        }

        process.exitCode = code;
    }
}
