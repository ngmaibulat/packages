import { NexiePromise } from '../zone/nexie-promise.ts';

/**
 * The Nexie error hierarchy.
 *
 * The class identifiers are Nexie-branded, but every user-visible `name` string
 * is the Dexie one on purpose: `.catch('ConstraintError', h)` matches on it, and
 * `Nexie.errnames.OpenFailed === 'OpenFailedError'` is part of the contract.
 * Renaming those strings would silently break migrated code.
 */

export class NexieError extends Error {
    /** The original error, when this one was mapped from a DOMException. */
    inner: unknown;

    constructor(message?: unknown, inner?: unknown) {
        // Both `(message, inner)` and the bare `(inner)` form are accepted, as
        // upstream does -- callers use whichever reads better at the throw site.
        let text: string;
        let cause: unknown;

        if (typeof message === 'string') {
            text = message;
            cause = inner;
        } else {
            cause = message ?? inner;
            text =
                cause instanceof Error
                    ? cause.message
                    : ((cause as { message?: string } | undefined)?.message ??
                      '');
        }

        super(text);
        this.name = 'NexieError';
        this.inner = cause;
    }

    override toString(): string {
        return `${this.name}: ${this.message}`;
    }
}

/** Errors raised by Nexie itself, with no IndexedDB counterpart. */
const nexieErrorNames = [
    'Modify',
    'Bulk',
    'OpenFailed',
    'VersionChange',
    'Schema',
    'Upgrade',
    'InvalidTable',
    'MissingAPI',
    'NoSuchDatabase',
    'InvalidArgument',
    'SubTransaction',
    'Unsupported',
    'Internal',
    'DatabaseClosed',
    'PrematureCommit',
    'ForeignAwait',
] as const;

/** DOMException names IndexedDB raises, mirrored so they can be caught the same way. */
const idbDomErrorNames = [
    'Unknown',
    'Constraint',
    'Data',
    'TransactionInactive',
    'ReadOnly',
    'Version',
    'NotFound',
    'InvalidState',
    'InvalidAccess',
    'Abort',
    'Timeout',
    'QuotaExceeded',
    'Syntax',
    'DataClone',
] as const;

export type NexieErrorName =
    | (typeof nexieErrorNames)[number]
    | (typeof idbDomErrorNames)[number];

const defaultMessages: Partial<Record<string, string>> = {
    VersionChange: 'Database version changed by other database connection',
    DatabaseClosed: 'Database has been closed',
    Abort: 'Transaction aborted',
    TransactionInactive: 'Transaction has already completed or failed',
    MissingAPI: 'IndexedDB API missing. Please visit https://tinyurl.com/y2uuvskb',
};

export interface NexieErrorConstructor {
    new (message?: unknown, inner?: unknown): NexieError;
    readonly prototype: NexieError;
}

function defineError(shortName: string): NexieErrorConstructor {
    const fullName = `${shortName}Error`;
    const defaultMessage = defaultMessages[shortName];

    class GeneratedError extends NexieError {
        constructor(message?: unknown, inner?: unknown) {
            super(message ?? defaultMessage, inner);
            this.name = fullName;
        }
    }

    // Without this the class's own `.name` stays 'GeneratedError', which shows
    // up in stack traces and devtools.
    Object.defineProperty(GeneratedError, 'name', { value: fullName });
    return GeneratedError;
}

/** Every generated class, keyed by short name. */
export const exceptions: Record<string, NexieErrorConstructor> = {};

/** `{ OpenFailed: 'OpenFailedError', ... }` for both name lists. */
export const errnames: Record<string, string> = {};

/** Keyed by the FULL name, which is what `mapError` looks up. */
const byFullName: Record<string, NexieErrorConstructor> = {};

for (const shortName of [...nexieErrorNames, ...idbDomErrorNames]) {
    const cls = defineError(shortName);
    exceptions[shortName] = cls;
    errnames[shortName] = `${shortName}Error`;
    byFullName[`${shortName}Error`] = cls;
}

/**
 * The classes mixed onto the `Nexie` constructor (`Nexie.ConstraintError`, ...),
 * keyed by full name. `Syntax` is deliberately excluded below in favour of the
 * ES built-in, matching upstream.
 */
export const fullNameExceptions: Record<string, NexieErrorConstructor> = {
    ...byFullName,
};
fullNameExceptions['NexieError'] = NexieError as NexieErrorConstructor;

// `SyntaxError`, `TypeError` and `RangeError` are ES built-ins rather than
// Nexie classes, so throwing sites use those directly and callers can catch
// them with the language's own hierarchy.
export const ModifyError = exceptions['Modify']!;
export const BulkError = exceptions['Bulk']!;

/**
 * Convert a DOMException/DOMError into the matching Nexie class, preserving the
 * original as `.inner` and proxying its stack.
 *
 * Installed as `NexiePromise.rejectionMapper`, so every rejection in the library
 * is normalised in one place rather than at each call site. That is what makes
 * `.catch(Nexie.ConstraintError, h)` and `.catch('ConstraintError', h)` both
 * work on an error that arrived as a raw DOMException.
 */
export function mapError(error: unknown): unknown {
    if (!error || error instanceof NexieError) return error;

    const name = (error as { name?: string }).name;
    if (!name) return error;

    const ErrorClass = byFullName[name];
    if (!ErrorClass) return error;

    const mapped = new ErrorClass(
        (error as { message?: string }).message,
        error,
    );
    // Point at the original's stack: ours starts inside this mapper, which is
    // never where the problem is.
    const stack = (error as { stack?: string }).stack;
    if (stack) {
        Object.defineProperty(mapped, 'stack', {
            value: stack,
            configurable: true,
            writable: true,
        });
    }
    return mapped;
}

NexiePromise.rejectionMapper = mapError;
