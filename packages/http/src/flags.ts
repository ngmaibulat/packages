import type { ParseArgsOptionsConfig } from 'node:util';

export type FlagGroup = 'body' | 'auth' | 'output' | 'network' | 'meta';

export interface FlagSpec {
    type: 'boolean' | 'string';
    short?: string;
    multiple?: boolean;
    /** Placeholder shown in help for string flags, e.g. `<path>`. */
    valueName?: string;
    description: string;
    group: FlagGroup;
    /** Kept working but hidden from help -- deprecated surface. */
    hidden?: boolean;
}

/**
 * The single source of truth for the flag surface: `parseArgs` and `--help` are both
 * generated from this object, so usage text cannot drift from behaviour.
 */
export const FLAGS = {
    json: {
        type: 'boolean',
        short: 'j',
        description: 'Serialize body fields as JSON (the default)',
        group: 'body',
    },
    form: {
        type: 'boolean',
        short: 'f',
        description: 'Serialize body fields as a form (multipart if any @ item is present)',
        group: 'body',
    },
    multipart: {
        type: 'boolean',
        description: 'Force a multipart body even with no file item',
        group: 'body',
    },
    raw: {
        type: 'string',
        valueName: '<text>',
        description: 'Send this literal string as the request body',
        group: 'body',
    },
    file: {
        type: 'string',
        valueName: '<path>',
        description: 'Send this file as the entire request body',
        group: 'body',
    },

    auth: {
        type: 'string',
        short: 'a',
        valueName: '<user[:pass]>',
        description: 'Basic auth; omit the password to be prompted',
        group: 'auth',
    },
    bearer: {
        type: 'string',
        valueName: '<token>',
        description: 'Send Authorization: Bearer <token>',
        group: 'auth',
    },

    print: {
        type: 'string',
        short: 'p',
        valueName: '<HhBbm>',
        description: 'What to print: H=req headers, B=req body, h=res headers, b=res body, m=timing',
        group: 'output',
    },
    headers: {
        type: 'boolean',
        description: 'Print only the response headers (same as -p h)',
        group: 'output',
    },
    body: {
        type: 'boolean',
        description: 'Print only the response body (same as -p b)',
        group: 'output',
    },
    verbose: {
        type: 'boolean',
        short: 'v',
        description: 'Print the request as well as the response (same as -p HBhbm)',
        group: 'output',
    },
    quiet: {
        type: 'boolean',
        short: 'q',
        description: 'Print nothing',
        group: 'output',
    },
    output: {
        type: 'string',
        short: 'o',
        valueName: '<file>',
        description: 'Write the response body to a file',
        group: 'output',
    },
    download: {
        type: 'boolean',
        short: 'd',
        description: 'Write the response body to a filename derived from the response',
        group: 'output',
    },
    pretty: {
        type: 'string',
        valueName: '<all|colors|format|none>',
        description: 'Override colour and formatting detection',
        group: 'output',
    },

    follow: {
        type: 'boolean',
        short: 'L',
        description: 'Follow redirects',
        group: 'network',
    },
    'max-redirects': {
        type: 'string',
        valueName: '<n>',
        description: 'Maximum redirects to follow (default 10; implies --follow)',
        group: 'network',
    },
    timeout: {
        type: 'string',
        valueName: '<sec>',
        description: 'Give up after this many seconds',
        group: 'network',
    },
    insecure: {
        type: 'boolean',
        short: 'k',
        description: 'Skip TLS certificate verification (process-wide)',
        group: 'network',
    },
    'check-status': {
        type: 'boolean',
        description: 'Exit non-zero on 3xx/4xx/5xx responses',
        group: 'network',
    },
    offline: {
        type: 'boolean',
        description: 'Build and print the request without sending it',
        group: 'network',
    },

    help: {
        type: 'boolean',
        short: 'h',
        description: 'Show this help',
        group: 'meta',
    },
    version: {
        type: 'boolean',
        short: 'V',
        description: 'Show the version',
        group: 'meta',
    },

    // Deprecated 0.0.x surface, kept working for one release.
    url: {
        type: 'string',
        short: 'u',
        valueName: '<url>',
        description: 'Deprecated: pass the URL positionally instead',
        group: 'meta',
        hidden: true,
    },
    filename: {
        type: 'string',
        valueName: '<path>',
        description: 'Deprecated: use --file instead',
        group: 'meta',
        hidden: true,
    },
} as const satisfies Record<string, FlagSpec>;

export type FlagName = keyof typeof FLAGS;

/**
 * `parseArgs` tolerates the extra keys at runtime, but its types do not -- so project
 * down to exactly the fields it declares rather than casting the whole object.
 */
export function toParseArgsOptions(): ParseArgsOptionsConfig {
    const options: ParseArgsOptionsConfig = {};

    for (const [name, spec] of Object.entries(FLAGS as Record<string, FlagSpec>)) {
        options[name] = {
            type: spec.type,
            ...(spec.short === undefined ? {} : { short: spec.short }),
            ...(spec.multiple === undefined ? {} : { multiple: spec.multiple }),
        };
    }

    return options;
}
