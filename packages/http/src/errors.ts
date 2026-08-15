export const EXIT = {
    OK: 0,
    ERROR: 1,
    USAGE: 2,
    TIMEOUT: 3,
    TOO_MANY_REDIRECTS: 4,
    STATUS_4XX: 5,
    STATUS_5XX: 6,
    STATUS_3XX: 7,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export class CliError extends Error {
    readonly code: ExitCode;
    readonly hint: string | undefined;

    constructor(code: ExitCode, message: string, hint?: string) {
        super(message);
        this.name = 'CliError';
        this.code = code;
        this.hint = hint;
    }
}

/** Errors carrying a libuv/OpenSSL-style `code`, which is where the useful detail lives. */
interface CodedError extends Error {
    code?: string;
}

function hasErrorShape(value: unknown): value is CodedError {
    return value instanceof Error;
}

/**
 * `fetch` reports every transport failure as a bare `TypeError: fetch failed` and hides the
 * real reason in `cause` -- sometimes several levels down, sometimes inside an AggregateError
 * when a host resolves to more than one address. Dig out the first thing worth printing.
 */
function rootCause(err: unknown): CodedError | undefined {
    let current: unknown = err;

    for (let depth = 0; depth < 8; depth++) {
        if (!hasErrorShape(current)) return undefined;

        if (current instanceof AggregateError && current.errors.length > 0) {
            current = current.errors[0];
            continue;
        }

        const error: CodedError = current;

        if (error.code) return error;
        if (error.cause === undefined || error.cause === null) return error;

        current = error.cause;
    }

    return undefined;
}

const NETWORK_HINTS: Record<string, string> = {
    ECONNREFUSED: 'connection refused',
    ECONNRESET: 'connection reset by peer',
    ENOTFOUND: 'host not found',
    EAI_AGAIN: 'DNS lookup failed',
    EHOSTUNREACH: 'host unreachable',
    ENETUNREACH: 'network unreachable',
    EPIPE: 'connection closed while sending',
    ETIMEDOUT: 'connection timed out',
    CERT_HAS_EXPIRED: 'the server certificate has expired',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'self-signed certificate',
    SELF_SIGNED_CERT_IN_CHAIN: 'self-signed certificate in the chain',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'unable to verify the certificate',
    ERR_TLS_CERT_ALTNAME_INVALID: 'certificate does not match the hostname',
};

/** TLS problems are worth telling the user about `--insecure`; nothing else is. */
const TLS_CODES = new Set([
    'CERT_HAS_EXPIRED',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export interface FormattedError {
    message: string;
    hint: string | undefined;
    code: ExitCode;
}

/** Turn anything thrown during a run into a one-line message plus an exit code. */
export function formatError(err: unknown): FormattedError {
    if (err instanceof CliError) {
        return { message: err.message, hint: err.hint, code: err.code };
    }

    const cause = rootCause(err);
    const causeCode = cause?.code;

    if (causeCode && causeCode in NETWORK_HINTS) {
        const detail = NETWORK_HINTS[causeCode] as string;
        return {
            message: `${detail} (${causeCode})`,
            hint: TLS_CODES.has(causeCode) ? 'use --insecure to skip TLS verification' : undefined,
            code: EXIT.ERROR,
        };
    }

    if (cause) {
        return { message: causeCode ? `${cause.message} (${causeCode})` : cause.message, hint: undefined, code: EXIT.ERROR };
    }

    return { message: err instanceof Error ? err.message : String(err), hint: undefined, code: EXIT.ERROR };
}
