import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgv, resolveUrl, type Options, type ParseContext } from '../src/args.ts';
import { CliError, EXIT } from '../src/errors.ts';

const BASE: ParseContext = { invokedAs: 'get', fixedMethod: 'GET', stdoutIsTTY: true, stdinIsTTY: true };

function run(argv: string[], context: Partial<ParseContext> = {}): Options {
    const result = parseArgv(argv, { ...BASE, ...context });
    assert.equal(result.kind, 'run');
    return (result as { kind: 'run'; options: Options }).options;
}

test('URL resolution', async (t) => {
    await t.test('bare host gets http://', () => {
        assert.equal(resolveUrl('example.com').href, 'http://example.com/');
    });

    await t.test('explicit scheme is kept', () => {
        assert.equal(resolveUrl('https://example.com/a').href, 'https://example.com/a');
    });

    await t.test('host:port without a scheme', () => {
        assert.equal(resolveUrl('example.com:8080/x').href, 'http://example.com:8080/x');
    });

    await t.test('leading colon plus port means localhost', () => {
        assert.equal(resolveUrl(':8080/api').href, 'http://localhost:8080/api');
    });

    await t.test('leading colon plus path means localhost', () => {
        assert.equal(resolveUrl(':/api').href, 'http://localhost/api');
    });

    await t.test('a lone colon means localhost', () => {
        assert.equal(resolveUrl(':').href, 'http://localhost/');
    });

    await t.test('empty and malformed URLs are usage errors', () => {
        assert.throws(() => resolveUrl(''), CliError);
        assert.throws(() => resolveUrl('http://'), CliError);
    });
});

test('method resolution', async (t) => {
    await t.test('a shortcut bin fixes the method', () => {
        assert.equal(run(['example.com']).method, 'GET');
        assert.equal(run(['example.com'], { fixedMethod: 'QUERY', invokedAs: 'query' }).method, 'QUERY');
    });

    await t.test('httpc reads the method from the first positional', () => {
        const options = run(['put', 'example.com'], { fixedMethod: undefined, invokedAs: 'httpc' });
        assert.equal(options.method, 'PUT');
        assert.equal(options.url.href, 'http://example.com/');
    });

    await t.test('httpc uppercases and accepts unknown methods', () => {
        assert.equal(run(['purge', 'example.com'], { fixedMethod: undefined, invokedAs: 'httpc' }).method, 'PURGE');
    });

    await t.test('httpc with a single positional treats it as the URL', () => {
        const options = run(['example.com'], { fixedMethod: undefined, invokedAs: 'httpc' });
        assert.equal(options.method, 'GET');
        assert.equal(options.url.href, 'http://example.com/');
    });

    await t.test('httpc defaults to POST when a body item is present', () => {
        const options = run(['example.com', 'a=1'], { fixedMethod: undefined, invokedAs: 'httpc' });
        assert.equal(options.method, 'POST');
    });

    await t.test('httpc defaults to POST when stdin actually carries data', () => {
        const options = run(['example.com'], { fixedMethod: undefined, invokedAs: 'httpc', stdinHasData: true });
        assert.equal(options.method, 'POST');
    });

    await t.test('a non-TTY stdin with no data does not imply POST', () => {
        // Every script and CI step has a non-TTY stdin; that alone must not change the method.
        const options = run(['example.com'], {
            fixedMethod: undefined,
            invokedAs: 'httpc',
            stdinIsTTY: false,
            stdinHasData: false,
        });
        assert.equal(options.method, 'GET');
    });

    await t.test('a query item alone does not imply POST', () => {
        const options = run(['example.com', 'a==1'], { fixedMethod: undefined, invokedAs: 'httpc' });
        assert.equal(options.method, 'GET');
    });
});

test('GET and HEAD reject a body', async (t) => {
    await t.test('body items are a usage error', () => {
        assert.throws(
            () => run(['example.com', 'a=1']),
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.equal(err.code, EXIT.USAGE);
                assert.match(err.message, /GET cannot have a request body/);
                assert.match(String(err.hint), /QUERY method/);
                return true;
            },
        );
    });

    await t.test('--raw is a usage error', () => {
        assert.throws(() => run(['example.com', '--raw', 'x']), CliError);
    });

    await t.test('query items are fine', () => {
        assert.equal(run(['example.com', 'a==1']).items.length, 1);
    });

    await t.test('QUERY may have a body', () => {
        const options = run(['example.com', 'a=1'], { fixedMethod: 'QUERY', invokedAs: 'query' });
        assert.equal(options.method, 'QUERY');
        assert.equal(options.items.length, 1);
    });
});

test('print sets', async (t) => {
    await t.test('TTY defaults to headers plus body', () => {
        assert.deepEqual(run(['example.com']).flags.print, {
            reqHeaders: false,
            reqBody: false,
            resHeaders: true,
            resBody: true,
            meta: false,
        });
    });

    await t.test('piped output defaults to body only', () => {
        assert.deepEqual(run(['example.com'], { stdoutIsTTY: false }).flags.print, {
            reqHeaders: false,
            reqBody: false,
            resHeaders: false,
            resBody: true,
            meta: false,
        });
    });

    await t.test('--verbose turns everything on', () => {
        assert.deepEqual(run(['example.com', '--verbose']).flags.print, {
            reqHeaders: true,
            reqBody: true,
            resHeaders: true,
            resBody: true,
            meta: true,
        });
    });

    await t.test('--headers and --body are shorthands', () => {
        assert.equal(run(['example.com', '--headers']).flags.print.resBody, false);
        assert.equal(run(['example.com', '--body']).flags.print.resHeaders, false);
    });

    await t.test('--quiet prints nothing', () => {
        assert.deepEqual(run(['example.com', '--quiet']).flags.print, {
            reqHeaders: false,
            reqBody: false,
            resHeaders: false,
            resBody: false,
            meta: false,
        });
    });

    await t.test('-p overrides --verbose', () => {
        assert.deepEqual(run(['example.com', '--verbose', '-p', 'b']).flags.print, {
            reqHeaders: false,
            reqBody: false,
            resHeaders: false,
            resBody: true,
            meta: false,
        });
    });

    await t.test('an unknown letter is a usage error', () => {
        assert.throws(() => run(['example.com', '-p', 'z']), CliError);
    });
});

test('numeric and enum flags', async (t) => {
    await t.test('--timeout accepts fractions', () => {
        assert.equal(run(['example.com', '--timeout', '0.05']).flags.timeout, 0.05);
    });

    await t.test('--timeout rejects zero and text', () => {
        assert.throws(() => run(['example.com', '--timeout', '0']), CliError);
        assert.throws(() => run(['example.com', '--timeout', 'soon']), CliError);
    });

    await t.test('--max-redirects implies --follow', () => {
        const flags = run(['example.com', '--max-redirects', '3']).flags;
        assert.equal(flags.maxRedirects, 3);
        assert.equal(flags.follow, true);
    });

    await t.test('--max-redirects rejects fractions', () => {
        assert.throws(() => run(['example.com', '--max-redirects', '1.5']), CliError);
    });

    await t.test('redirects are not followed by default', () => {
        assert.equal(run(['example.com']).flags.follow, false);
        assert.equal(run(['example.com']).flags.maxRedirects, 10);
    });

    await t.test('--pretty validates its mode', () => {
        assert.equal(run(['example.com', '--pretty', 'none']).flags.pretty, 'none');
        assert.throws(() => run(['example.com', '--pretty', 'sparkly']), CliError);
    });
});

test('flag conflicts and errors', async (t) => {
    await t.test('--json and --form are mutually exclusive', () => {
        assert.throws(
            () => run(['example.com', '--json', '--form'], { fixedMethod: 'POST', invokedAs: 'post' }),
            CliError,
        );
    });

    await t.test('an unknown flag is a usage error with a hint', () => {
        assert.throws(
            () => run(['example.com', '--nope']),
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.equal(err.code, EXIT.USAGE);
                assert.match(String(err.hint), /get --help/);
                return true;
            },
        );
    });

    await t.test('a missing URL is a usage error', () => {
        assert.throws(() => run([]), CliError);
    });

    await t.test('-- lets an item start with a dash', () => {
        const options = run(['example.com', '--', '-X-Odd:1']);
        assert.deepEqual(options.items[0], { kind: 'header', name: '-X-Odd', value: '1' });
    });
});

test('help and version short-circuit', async (t) => {
    await t.test('--help', () => {
        assert.deepEqual(parseArgv(['--help'], BASE), { kind: 'help', invokedAs: 'get', fixedMethod: 'GET' });
    });

    await t.test('-h is help, not headers', () => {
        assert.equal(parseArgv(['-h'], BASE).kind, 'help');
    });

    await t.test('--version', () => {
        assert.equal(parseArgv(['--version'], BASE).kind, 'version');
    });
});

test('legacy 0.0.x invocations still work', async (t) => {
    await t.test('-u maps to the positional URL and warns', () => {
        const options = run(['-u', 'https://example.com/get']);
        assert.equal(options.url.href, 'https://example.com/get');
        assert.match(String(options.deprecation), /deprecated/);
    });

    await t.test('-f maps to --file in legacy mode', () => {
        const options = run(['-u', 'https://example.com/post', '-f', 'package.json'], {
            fixedMethod: 'POST',
            invokedAs: 'post',
        });
        assert.equal(options.flags.file, 'package.json');
        assert.equal(options.method, 'POST');
    });

    await t.test('--url=x form is recognized', () => {
        assert.equal(run(['--url=https://example.com/']).url.href, 'https://example.com/');
    });

    await t.test('-f alone still means --form in modern mode', () => {
        const options = run(['example.com', 'a=1', '-f'], { fixedMethod: 'POST', invokedAs: 'post' });
        assert.equal(options.flags.form, true);
        assert.equal(options.flags.file, undefined);
    });
});
