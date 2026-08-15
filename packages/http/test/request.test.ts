import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseArgv, type Options, type ParseContext } from '../src/args.ts';
import { buildRequest, type BuildDeps, type Prepared } from '../src/request.ts';
import { CliError, EXIT } from '../src/errors.ts';

const CONTEXT: ParseContext = { invokedAs: 'post', fixedMethod: 'POST', stdoutIsTTY: false, stdinIsTTY: true };

function options(argv: string[], context: Partial<ParseContext> = {}): Options {
    const result = parseArgv(argv, { ...CONTEXT, ...context });
    assert.equal(result.kind, 'run');
    return (result as { kind: 'run'; options: Options }).options;
}

function deps(overrides: Partial<BuildDeps> = {}): BuildDeps {
    return {
        readStdin: async () => null,
        promptPassword: async () => 'prompted',
        stdinIsTTY: true,
        ...overrides,
    };
}

function build(argv: string[], context: Partial<ParseContext> = {}, d: Partial<BuildDeps> = {}): Promise<Prepared> {
    return buildRequest(options(argv, context), deps(d));
}

let dir = '';
let jsonFixture = '';
let textFixture = '';

test.before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'aibulat-http-'));
    jsonFixture = path.join(dir, 'meta.json');
    textFixture = path.join(dir, 'bio.txt');
    await writeFile(jsonFixture, '{"nested":{"a":1},"n":2}\n');
    await writeFile(textFixture, 'hello from a file\n');
});

test.after(async () => {
    await rm(dir, { recursive: true, force: true });
});

test('method is uppercased before it reaches fetch', async (t) => {
    // fetch only normalizes the six "known" methods; a lowercase QUERY is rejected
    // on the wire with HPE_INVALID_METHOD, so this must happen here.
    await t.test('QUERY', async () => {
        const prepared = await build(['example.com'], { fixedMethod: 'query', invokedAs: 'query' });
        assert.equal(prepared.method, 'QUERY');
    });

    await t.test('arbitrary methods via httpc', async () => {
        const prepared = await build(['purge', 'example.com'], { fixedMethod: undefined, invokedAs: 'httpc' });
        assert.equal(prepared.method, 'PURGE');
    });
});

test('query parameters', async (t) => {
    await t.test('are appended, preserving existing URL params', async () => {
        const prepared = await build(['example.com/a?keep=1', 'q==search', 'page==2'], {
            fixedMethod: 'GET',
            invokedAs: 'get',
        });
        assert.equal(prepared.url.search, '?keep=1&q=search&page=2');
    });

    await t.test('repeat rather than overwrite', async () => {
        const prepared = await build(['example.com', 'tag==a', 'tag==b'], { fixedMethod: 'GET', invokedAs: 'get' });
        assert.deepEqual(prepared.url.searchParams.getAll('tag'), ['a', 'b']);
    });

    await t.test('are URL-encoded', async () => {
        const prepared = await build(['example.com', 'q==a b&c'], { fixedMethod: 'GET', invokedAs: 'get' });
        assert.equal(prepared.url.searchParams.get('q'), 'a b&c');
        assert.match(prepared.url.search, /q=a\+b%26c/);
    });
});

test('headers', async (t) => {
    await t.test('override our defaults', async () => {
        const prepared = await build(['example.com', 'Accept:text/csv'], { fixedMethod: 'GET', invokedAs: 'get' });
        assert.equal(prepared.headers.get('accept'), 'text/csv');
    });

    await t.test('repeated names accumulate', async () => {
        // Headers joins Cookie with '; ' (it is special-cased in the spec) and
        // everything else with ', '.
        const cookies = await build(['example.com', 'Cookie:a=1', 'Cookie:b=2'], {
            fixedMethod: 'GET',
            invokedAs: 'get',
        });
        assert.equal(cookies.headers.get('cookie'), 'a=1; b=2');

        const accepts = await build(['example.com', 'X-Tag:one', 'X-Tag:two'], {
            fixedMethod: 'GET',
            invokedAs: 'get',
        });
        assert.equal(accepts.headers.get('x-tag'), 'one, two');
    });

    await t.test('a bare colon removes a default', async () => {
        const prepared = await build(['example.com', 'Accept:'], { fixedMethod: 'GET', invokedAs: 'get' });
        assert.equal(prepared.headers.has('accept'), false);
    });

    await t.test('a semicolon sends an empty value', async () => {
        const prepared = await build(['example.com', 'X-Empty;'], { fixedMethod: 'GET', invokedAs: 'get' });
        assert.equal(prepared.headers.get('x-empty'), '');
    });

    await t.test('a User-Agent is sent by default and is overridable', async () => {
        const fallback = await build(['example.com'], { fixedMethod: 'GET', invokedAs: 'get' });
        assert.match(String(fallback.headers.get('user-agent')), /^@aibulat\/http\//);

        const custom = await build(['example.com', 'User-Agent:me/1'], { fixedMethod: 'GET', invokedAs: 'get' });
        assert.equal(custom.headers.get('user-agent'), 'me/1');
    });
});

test('JSON bodies (the default)', async (t) => {
    await t.test('fields and raw values keep their types', async () => {
        const prepared = await build(['example.com', 'name=Alice', 'age:=30', 'ok:=true', 'tags:=["a","b"]']);
        assert.equal(prepared.headers.get('content-type'), 'application/json');
        assert.deepEqual(JSON.parse(prepared.body as string), {
            name: 'Alice',
            age: 30,
            ok: true,
            tags: ['a', 'b'],
        });
    });

    await t.test('field order is preserved and duplicates take the last value', async () => {
        const prepared = await build(['example.com', 'b=2', 'a=1', 'b=3']);
        assert.equal(prepared.body, '{"b":"3","a":"1"}');
    });

    await t.test('=@ reads a string from a file', async () => {
        const prepared = await build(['example.com', `bio=@${textFixture}`]);
        assert.deepEqual(JSON.parse(prepared.body as string), { bio: 'hello from a file\n' });
    });

    await t.test(':=@ parses JSON from a file', async () => {
        const prepared = await build(['example.com', `meta:=@${jsonFixture}`]);
        assert.deepEqual(JSON.parse(prepared.body as string), { meta: { nested: { a: 1 }, n: 2 } });
    });

    await t.test('a missing file is a readable error', async () => {
        await assert.rejects(
            () => build(['example.com', 'bio=@/no/such/file.txt']),
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.equal(err.code, EXIT.ERROR);
                assert.match(err.message, /cannot read field file .*ENOENT/);
                return true;
            },
        );
    });

    await t.test('malformed JSON in a :=@ file names the file', async () => {
        const bad = path.join(dir, 'bad.json');
        await writeFile(bad, '{oops');
        await assert.rejects(() => build(['example.com', `meta:=@${bad}`]), CliError);
    });
});

test('form bodies', async (t) => {
    await t.test('--form is urlencoded', async () => {
        const prepared = await build(['example.com', 'a=1', 'b=two words', '--form']);
        assert.equal(prepared.headers.get('content-type'), 'application/x-www-form-urlencoded; charset=utf-8');
        assert.equal(prepared.body, 'a=1&b=two+words');
    });

    await t.test('raw values are stringified', async () => {
        const prepared = await build(['example.com', 'n:=5', 'o:={"a":1}', '--form']);
        assert.equal(prepared.body, 'n=5&o=%7B%22a%22%3A1%7D');
    });
});

test('multipart bodies', async (t) => {
    await t.test('an @ item forces multipart and carries the filename and MIME', async () => {
        const prepared = await build(['example.com', `doc@${jsonFixture}`, 'caption=hi']);

        assert.ok(prepared.body instanceof FormData);
        // Content-Type must be left unset so undici can generate the boundary.
        assert.equal(prepared.headers.has('content-type'), false);

        const parsed = await new Response(prepared.body).formData();
        assert.equal(parsed.get('caption'), 'hi');

        const file = parsed.get('doc');
        assert.ok(file instanceof File);
        assert.equal(file.name, 'meta.json');
        assert.equal(file.type, 'application/json');
        assert.equal(await file.text(), '{"nested":{"a":1},"n":2}\n');
    });

    await t.test('--multipart forces it with no file item', async () => {
        const prepared = await build(['example.com', 'a=1', '--multipart']);
        assert.ok(prepared.body instanceof FormData);
    });

    await t.test('a Content-Type without a boundary is a usage error', async () => {
        await assert.rejects(
            () => build(['example.com', `doc@${jsonFixture}`, 'Content-Type:multipart/form-data']),
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.equal(err.code, EXIT.USAGE);
                assert.match(err.message, /must include a boundary/);
                return true;
            },
        );
    });
});

test('whole-body sources', async (t) => {
    await t.test('--raw sends the literal text as text/plain', async () => {
        const prepared = await build(['example.com', '--raw', 'hello']);
        assert.equal(prepared.body, 'hello');
        assert.equal(prepared.headers.get('content-type'), 'text/plain; charset=utf-8');
    });

    await t.test('--raw with --json is sent as JSON', async () => {
        const prepared = await build(['example.com', '--raw', '{"a":1}', '--json']);
        assert.equal(prepared.headers.get('content-type'), 'application/json');
    });

    await t.test('--file guesses the type and has a real length', async () => {
        const prepared = await build(['example.com', '--file', jsonFixture]);
        assert.ok(prepared.body instanceof Blob);
        assert.equal(prepared.body.type, 'application/json');
        assert.equal(prepared.body.size, 25);
        assert.equal(prepared.headers.get('content-type'), 'application/json');
    });

    await t.test('an explicit Content-Type beats the guess', async () => {
        const prepared = await build(['example.com', '--file', jsonFixture, 'Content-Type:application/x-custom']);
        assert.equal(prepared.headers.get('content-type'), 'application/x-custom');
    });

    await t.test('a missing --file is a readable error', async () => {
        await assert.rejects(() => build(['example.com', '--file', '/no/such/file']), CliError);
    });
});

test('stdin', async (t) => {
    const piped = { stdinIsTTY: false };

    await t.test('is used when nothing else supplies a body', async () => {
        const prepared = await build(['example.com'], { stdinIsTTY: false }, {
            ...piped,
            readStdin: async () => Buffer.from('{"a":1}'),
        });
        assert.equal((prepared.body as Buffer).toString(), '{"a":1}');
        assert.equal(prepared.headers.get('content-type'), 'application/json');
    });

    await t.test('non-JSON input is sent as octet-stream', async () => {
        const prepared = await build(['example.com'], { stdinIsTTY: false }, {
            ...piped,
            readStdin: async () => Buffer.from('plain text'),
        });
        assert.equal(prepared.headers.get('content-type'), 'application/octet-stream');
    });

    await t.test('an explicit Content-Type wins over sniffing', async () => {
        const prepared = await build(['example.com', 'Content-Type:text/csv'], { stdinIsTTY: false }, {
            ...piped,
            readStdin: async () => Buffer.from('a,b'),
        });
        assert.equal(prepared.headers.get('content-type'), 'text/csv');
    });

    await t.test('is not drained when body items are present', async () => {
        let drained = false;
        const prepared = await build(['example.com', 'a=1'], { stdinIsTTY: false }, {
            ...piped,
            readStdin: async () => {
                drained = true;
                return Buffer.from('ignored');
            },
        });
        assert.equal(drained, false);
        assert.equal(prepared.body, '{"a":"1"}');
    });

    await t.test('empty stdin means no body', async () => {
        const prepared = await build(['example.com'], { stdinIsTTY: false }, {
            ...piped,
            readStdin: async () => Buffer.alloc(0),
        });
        assert.equal(prepared.body, null);
    });
});

test('authentication', async (t) => {
    await t.test('--auth builds a Basic header', async () => {
        const prepared = await build(['example.com', '--auth', 'user:pass']);
        assert.equal(prepared.headers.get('authorization'), `Basic ${Buffer.from('user:pass').toString('base64')}`);
        assert.equal(prepared.headers.get('authorization'), 'Basic dXNlcjpwYXNz');
    });

    await t.test('a password containing colons is kept whole', async () => {
        const prepared = await build(['example.com', '--auth', 'user:a:b']);
        assert.equal(prepared.headers.get('authorization'), `Basic ${Buffer.from('user:a:b').toString('base64')}`);
    });

    await t.test('--auth without a password prompts', async () => {
        const prepared = await build(['example.com', '--auth', 'user'], {}, { promptPassword: async () => 'secret' });
        assert.equal(prepared.headers.get('authorization'), `Basic ${Buffer.from('user:secret').toString('base64')}`);
    });

    await t.test('--auth without a password fails when stdin is not a terminal', async () => {
        await assert.rejects(
            () => build(['example.com', '--auth', 'user'], { stdinIsTTY: false }, { stdinIsTTY: false }),
            CliError,
        );
    });

    await t.test('--bearer', async () => {
        const prepared = await build(['example.com', '--bearer', 'tok']);
        assert.equal(prepared.headers.get('authorization'), 'Bearer tok');
    });

    await t.test('--auth and --bearer conflict', async () => {
        await assert.rejects(() => build(['example.com', '--auth', 'u:p', '--bearer', 't']), CliError);
    });

    await t.test('an explicit Authorization header wins', async () => {
        const prepared = await build(['example.com', '--bearer', 'tok', 'Authorization:Custom xyz']);
        assert.equal(prepared.headers.get('authorization'), 'Custom xyz');
    });
});
