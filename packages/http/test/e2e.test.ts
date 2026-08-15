import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BINARY_BODY, startServer, type Fixture } from './helpers/server.ts';
import { runBin } from './helpers/run.ts';

let server: Fixture;
let dir: string;
let fixtureFile: string;

interface Echo {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
}

test.before(async () => {
    server = await startServer();
    dir = await mkdtemp(path.join(tmpdir(), 'aibulat-http-e2e-'));
    fixtureFile = path.join(dir, 'note.txt');
    await writeFile(fixtureFile, 'file contents\n');
});

test.after(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
});

function url(pathname: string): string {
    return `${server.origin}${pathname}`;
}

function echo(stdout: string): Echo {
    return JSON.parse(stdout) as Echo;
}

/** A port that is guaranteed free: bind it, learn the number, then release it. */
async function findClosedPort(): Promise<number> {
    const { createServer } = await import('node:net');
    const probe = createServer();

    const port = await new Promise<number>((resolve) => {
        probe.listen(0, '127.0.0.1', () => {
            const address = probe.address();
            resolve(typeof address === 'object' && address !== null ? address.port : 0);
        });
    });

    await new Promise<void>((resolve) => probe.close(() => resolve()));
    return port;
}

test('GET', async (t) => {
    await t.test('sends query items and headers, exits 0', async () => {
        const { code, stdout } = await runBin('get', [url('/echo'), 'q==search', 'page==2', 'X-Key:abc']);

        assert.equal(code, 0);
        const seen = echo(stdout);
        assert.equal(seen.method, 'GET');
        assert.equal(seen.url, '/echo?q=search&page=2');
        assert.equal(seen.headers['x-key'], 'abc');
        assert.equal(seen.body, '');
    });

    await t.test('repeated query items are both sent', async () => {
        const { stdout } = await runBin('get', [url('/echo'), 'tag==a', 'tag==b']);
        assert.equal(echo(stdout).url, '/echo?tag=a&tag=b');
    });

    await t.test('body items are refused with a usage error', async () => {
        const { code, stderr } = await runBin('get', [url('/echo'), 'a=1']);
        assert.equal(code, 2);
        assert.match(stderr, /GET cannot have a request body/);
        assert.match(stderr, /QUERY method/);
    });
});

test('POST', async (t) => {
    await t.test('sends a JSON body with typed fields', async () => {
        const { code, stdout } = await runBin('post', [url('/echo'), 'a=1', 'b:=2', 'X-T:v']);

        assert.equal(code, 0);
        const seen = echo(stdout);
        assert.equal(seen.method, 'POST');
        assert.equal(seen.headers['content-type'], 'application/json');
        assert.equal(seen.headers['x-t'], 'v');
        assert.equal(seen.body, '{"a":"1","b":2}');
    });

    await t.test('--form sends urlencoded', async () => {
        const { stdout } = await runBin('post', [url('/echo'), 'a=1', 'b=two words', '--form']);
        const seen = echo(stdout);
        assert.equal(seen.headers['content-type'], 'application/x-www-form-urlencoded; charset=utf-8');
        assert.equal(seen.body, 'a=1&b=two+words');
    });

    await t.test('an @ item sends multipart with the filename', async () => {
        const { stdout } = await runBin('post', [url('/echo'), `doc@${fixtureFile}`, 'caption=hi']);
        const seen = echo(stdout);

        assert.match(String(seen.headers['content-type']), /^multipart\/form-data; boundary=/);
        assert.match(seen.body, /name="doc"; filename="note\.txt"/);
        assert.match(seen.body, /file contents/);
        assert.match(seen.body, /name="caption"/);
    });

    await t.test('--file sends the file as the whole body with a real length', async () => {
        const { stdout } = await runBin('post', [url('/echo'), '--file', fixtureFile]);
        const seen = echo(stdout);
        assert.equal(seen.body, 'file contents\n');
        assert.equal(seen.headers['content-length'], '14');
        assert.equal(seen.headers['content-type'], 'text/plain');
    });

    await t.test('piped stdin becomes the body', async () => {
        const { stdout } = await runBin('post', [url('/echo')], { stdin: '{"from":"stdin"}' });
        const seen = echo(stdout);
        assert.equal(seen.body, '{"from":"stdin"}');
        assert.equal(seen.headers['content-type'], 'application/json');
    });

    await t.test('non-JSON stdin is sent as octet-stream', async () => {
        const { stdout } = await runBin('post', [url('/echo')], { stdin: 'just text' });
        assert.equal(echo(stdout).headers['content-type'], 'application/octet-stream');
    });
});

test('QUERY', async (t) => {
    // The regression test for the trap that fetch only uppercases its six known
    // methods: a lowercase QUERY is rejected on the wire with HPE_INVALID_METHOD.
    await t.test('reaches the server as uppercase QUERY with a JSON body', async () => {
        const { code, stdout } = await runBin('query', [url('/echo'), 'filter=active', 'limit:=10']);

        assert.equal(code, 0);
        const seen = echo(stdout);
        assert.equal(seen.method, 'QUERY');
        assert.equal(seen.headers['content-type'], 'application/json');
        assert.equal(seen.body, '{"filter":"active","limit":10}');
        assert.equal(seen.headers['content-length'], '30');
    });

    await t.test('can combine a body with query-string parameters', async () => {
        const { stdout } = await runBin('query', [url('/echo'), 'sort==asc', 'filter=active']);
        const seen = echo(stdout);
        assert.equal(seen.url, '/echo?sort=asc');
        assert.equal(seen.body, '{"filter":"active"}');
    });

    await t.test('sends no body when given none', async () => {
        const { stdout } = await runBin('query', [url('/echo')]);
        const seen = echo(stdout);
        assert.equal(seen.method, 'QUERY');
        assert.equal(seen.body, '');
    });
});

test('other methods', async (t) => {
    for (const [bin, expected] of [
        ['put', 'PUT'],
        ['delete', 'DELETE'],
        ['options', 'OPTIONS'],
        ['patch', 'PATCH'],
    ] as const) {
        await t.test(`${bin} sends ${expected}`, async () => {
            const { code, stdout } = await runBin(bin, [url('/echo')]);
            assert.equal(code, 0);
            assert.equal(echo(stdout).method, expected);
        });
    }

    await t.test('head sends HEAD and has no body', async () => {
        const { code, stdout } = await runBin('head', [url('/echo'), '-p', 'h']);
        assert.equal(code, 0);
        assert.match(stdout, /HTTP\/1\.1 200/);
        assert.equal(server.last()?.method, 'HEAD');
    });
});

test('httpc umbrella', async (t) => {
    await t.test('takes the method as the first positional', async () => {
        const { code, stdout } = await runBin('httpc', ['put', url('/echo')]);
        assert.equal(code, 0);
        assert.equal(echo(stdout).method, 'PUT');
    });

    await t.test('passes through an arbitrary method', async () => {
        const { stdout } = await runBin('httpc', ['purge', url('/echo')]);
        assert.equal(echo(stdout).method, 'PURGE');
    });

    await t.test('defaults to GET with a single positional', async () => {
        const { stdout } = await runBin('httpc', [url('/echo')]);
        assert.equal(echo(stdout).method, 'GET');
    });

    await t.test('defaults to POST when a body item is present', async () => {
        const { stdout } = await runBin('httpc', [url('/echo'), 'a=1']);
        assert.equal(echo(stdout).method, 'POST');
    });
});

test('--offline builds the request without sending it', async () => {
    server.reset();
    const { code, stdout } = await runBin('post', [url('/echo'), 'name=Alice', '--offline']);

    assert.equal(code, 0);
    assert.match(stdout, /^POST \/echo HTTP\/1\.1$/m);
    assert.match(stdout, /^content-type: application\/json$/m);
    assert.match(stdout, /"name": "Alice"/);
    assert.equal(server.last(), null, 'no request should have reached the server');
});

test('output shaping', async (t) => {
    await t.test('piped stdout prints the body alone', async () => {
        const { stdout } = await runBin('get', [url('/json')]);
        assert.equal(stdout.startsWith('{'), true);
        assert.doesNotMatch(stdout, /HTTP\/1\.1/);
    });

    await t.test('-p h prints headers only', async () => {
        const { stdout } = await runBin('get', [url('/json'), '-p', 'h']);
        assert.match(stdout, /HTTP\/1\.1 200 OK/);
        assert.doesNotMatch(stdout, /"b"/);
    });

    await t.test('JSON is pretty-printed', async () => {
        const { stdout } = await runBin('get', [url('/json')]);
        assert.equal(stdout, '{\n  "b": 2,\n  "a": [\n    1,\n    {\n      "deep": true\n    }\n  ]\n}\n');
    });

    await t.test('a +json vendor type is still treated as JSON', async () => {
        const { stdout } = await runBin('get', [url('/vendor-json')]);
        assert.equal(stdout, '{\n  "ok": true\n}\n');
    });

    await t.test('malformed JSON is shown verbatim rather than swallowed', async () => {
        const { code, stdout } = await runBin('get', [url('/broken-json')]);
        assert.equal(code, 0);
        assert.equal(stdout, '{not really json\n');
    });

    await t.test('--pretty none leaves JSON unformatted', async () => {
        const { stdout } = await runBin('get', [url('/json'), '--pretty', 'none']);
        assert.equal(stdout, '{"b":2,"a":[1,{"deep":true}]}\n');
    });

    await t.test('NO_COLOR keeps output free of escape sequences', async () => {
        const { stdout } = await runBin('get', [url('/json'), '-p', 'hb']);
        assert.doesNotMatch(stdout, /\[/);
    });

    await t.test('FORCE_COLOR adds escape sequences even when piped', async () => {
        const { stdout } = await runBin('get', [url('/json')], { color: true });
        assert.match(stdout, /\[/);
    });

    await t.test('multiple Set-Cookie headers stay separate', async () => {
        const { stdout } = await runBin('get', [url('/cookies'), '-p', 'h']);
        const lines = stdout.split('\n').filter((line) => line.startsWith('set-cookie:'));
        assert.equal(lines.length, 2);
        assert.match(String(lines[0]), /a=1; Expires=Wed, 21 Oct 2026/);
        assert.match(String(lines[1]), /b=2; Path=\//);
    });

    await t.test('--verbose shows the request too', async () => {
        const { stdout } = await runBin('post', [url('/echo'), 'a=1', '--verbose']);
        assert.match(stdout, /^POST \/echo HTTP\/1\.1$/m);
        assert.match(stdout, /^HTTP\/1\.1 200 OK$/m);
    });

    await t.test('--verbose redacts credentials in the echoed request', async () => {
        const { stdout } = await runBin('get', [url('/echo'), '--verbose', '--auth', 'user:hunter2']);

        // Only the request head is ours to redact; the echo server naturally reflects the
        // real header back inside the response body.
        const requestHead = stdout.slice(0, stdout.indexOf('HTTP/1.1 200'));
        assert.match(requestHead, /authorization: Basic \*{8}/);
        assert.doesNotMatch(requestHead, /hunter2|dXNlcjpodW50ZXIy/);
    });

    await t.test('--quiet prints nothing', async () => {
        const { code, stdout } = await runBin('get', [url('/json'), '--quiet']);
        assert.equal(code, 0);
        assert.equal(stdout, '');
    });

    await t.test('a binary body is streamed through when piped', async () => {
        const { stdout } = await runBin('get', [url('/binary')]);
        assert.equal(Buffer.from(stdout, 'utf8').length > 0, true);
    });
});

test('redirects', async (t) => {
    await t.test('are not followed by default', async () => {
        const { code, stdout } = await runBin('get', [url('/redirect/1'), '-p', 'h']);
        assert.equal(code, 0);
        assert.match(stdout, /HTTP\/1\.1 302/);
    });

    await t.test('--follow reaches the destination', async () => {
        const { code, stdout } = await runBin('get', [url('/redirect/2'), '--follow']);
        assert.equal(code, 0);
        assert.equal(echo(stdout).url, '/echo');
    });

    await t.test('--max-redirects caps the chain and exits 4', async () => {
        const { code, stderr } = await runBin('get', [url('/redirect/5'), '--max-redirects', '1']);
        assert.equal(code, 4);
        assert.match(stderr, /exceeded --max-redirects \(1\)/);
    });

    await t.test('a 302 after POST becomes a GET without a body', async () => {
        const { code, stdout } = await runBin('post', [url('/redirect/1'), 'a=1', '--follow']);
        assert.equal(code, 0);
        const seen = echo(stdout);
        assert.equal(seen.method, 'GET');
        assert.equal(seen.body, '');
    });

    await t.test('a safe method keeps its identity across a 302', async () => {
        const { stdout } = await runBin('query', [url('/redirect/1'), '--follow']);
        assert.equal(echo(stdout).method, 'QUERY');
    });

    await t.test('307 preserves the method and body', async () => {
        const { stdout } = await runBin('post', [url('/redirect/1?status=307'), 'a=1', '--follow']);
        const seen = echo(stdout);
        assert.equal(seen.method, 'POST');
        assert.equal(seen.body, '{"a":"1"}');
    });
});

test('exit codes', async (t) => {
    await t.test('a 404 alone still exits 0', async () => {
        const { code } = await runBin('get', [url('/status/404')]);
        assert.equal(code, 0);
    });

    await t.test('--check-status maps 4xx to 5', async () => {
        const { code } = await runBin('get', [url('/status/404'), '--check-status']);
        assert.equal(code, 5);
    });

    await t.test('--check-status maps 5xx to 6', async () => {
        const { code } = await runBin('get', [url('/status/503'), '--check-status']);
        assert.equal(code, 6);
    });

    await t.test('--check-status maps an unfollowed 3xx to 7', async () => {
        const { code } = await runBin('get', [url('/redirect/1'), '--check-status']);
        assert.equal(code, 7);
    });

    await t.test('--timeout exits 3', async () => {
        const { code, stderr } = await runBin('get', [url('/slow?ms=2000'), '--timeout', '0.1']);
        assert.equal(code, 3);
        assert.match(stderr, /timed out after 0\.1s/);
    });

    await t.test('a refused connection exits 1 with a readable message', async () => {
        // Bind and release a port so we know nothing is listening on it. (Low ports such
        // as 1 are unusable here: the fetch spec blocks them outright with "bad port".)
        const closedPort = await findClosedPort();

        const { code, stderr } = await runBin('get', [`http://127.0.0.1:${closedPort}/nope`]);
        assert.equal(code, 1);
        assert.match(stderr, /connection refused \(ECONNREFUSED\)/);
    });

    await t.test('an unreadable upload file exits 1', async () => {
        const { code, stderr } = await runBin('post', [url('/echo'), 'doc@/no/such/file']);
        assert.equal(code, 1);
        assert.match(stderr, /cannot read file .*ENOENT/);
    });

    await t.test('a bad flag exits 2 with a hint', async () => {
        const { code, stderr } = await runBin('get', [url('/echo'), '--nonsense']);
        assert.equal(code, 2);
        assert.match(stderr, /hint: try 'get --help'/);
    });
});

test('saving to files', async (t) => {
    await t.test('--output writes exact bytes', async () => {
        const target = path.join(dir, 'out.png');
        const { code } = await runBin('get', [url('/binary'), '--output', target]);

        assert.equal(code, 0);
        assert.deepEqual(await readFile(target), BINARY_BODY);
    });

    await t.test('--download uses the Content-Disposition filename', async () => {
        const { code } = await runBin('get', [url('/download'), '--download'], { cwd: dir });

        assert.equal(code, 0);
        assert.equal(await readFile(path.join(dir, 'report.csv'), 'utf8'), 'a,b\n1,2\n');
    });

    await t.test('--download decodes an RFC 5987 filename', async () => {
        const { code } = await runBin('get', [url('/download-utf8'), '--download'], { cwd: dir });

        assert.equal(code, 0);
        assert.equal(await readFile(path.join(dir, 'résumé.txt'), 'utf8'), 'cv');
    });

    await t.test('--download never clobbers an existing file', async () => {
        await runBin('get', [url('/download'), '--download'], { cwd: dir });
        assert.equal(await readFile(path.join(dir, 'report-1.csv'), 'utf8'), 'a,b\n1,2\n');
    });
});

test('help and version', async (t) => {
    await t.test('--help lists the item syntax and exits 0', async () => {
        const { code, stdout } = await runBin('get', ['--help']);
        assert.equal(code, 0);
        assert.match(stdout, /Usage: get URL \[ITEM\.\.\.\]/);
        assert.match(stdout, /name==value/);
        assert.match(stdout, /--check-status/);
        assert.doesNotMatch(stdout, /--url/, 'the deprecated flag should be hidden');
    });

    await t.test('httpc --help shows the METHOD slot', async () => {
        const { stdout } = await runBin('httpc', ['--help']);
        assert.match(stdout, /Usage: httpc \[METHOD\] URL/);
    });

    await t.test('--version prints the package version', async () => {
        const { code, stdout } = await runBin('get', ['--version']);
        assert.equal(code, 0);
        assert.match(stdout, /^@aibulat\/http \d+\.\d+\.\d+$/m);
    });

    await t.test('no URL is a usage error', async () => {
        const { code, stderr } = await runBin('get', []);
        assert.equal(code, 2);
        assert.match(stderr, /no URL given/);
    });
});

test('authentication reaches the wire', async (t) => {
    await t.test('--auth', async () => {
        const { stdout } = await runBin('get', [url('/echo'), '--auth', 'user:pass']);
        assert.equal(echo(stdout).headers['authorization'], 'Basic dXNlcjpwYXNz');
    });

    await t.test('--bearer', async () => {
        const { stdout } = await runBin('get', [url('/echo'), '--bearer', 'tok']);
        assert.equal(echo(stdout).headers['authorization'], 'Bearer tok');
    });
});

test('legacy 0.0.x invocations still work', async (t) => {
    await t.test('-u still selects the URL and warns', async () => {
        const { code, stdout, stderr } = await runBin('get', ['-u', url('/echo')]);

        assert.equal(code, 0);
        assert.equal(echo(stdout).method, 'GET');
        assert.match(stderr, /warning: -u\/--url is deprecated/);
    });

    await t.test('-u with -f uploads the file as the body', async () => {
        const { code, stdout } = await runBin('post', ['-u', url('/echo'), '-f', fixtureFile]);

        assert.equal(code, 0);
        // The 0.0.x code never actually sent this: the stream promise was not awaited.
        assert.equal(echo(stdout).body, 'file contents\n');
    });
});

test('httpc link guard rails', async (t) => {
    // The links themselves are not created here: that would mutate the PATH directory
    // the test runner itself depends on. Only the refusals are exercised.
    await t.test('refuses methods that are already installed', async () => {
        const { code, stderr } = await runBin('httpc', ['link', 'get']);
        assert.equal(code, 2);
        assert.match(stderr, /get is not an opt-in shortcut/);
        assert.match(stderr, /only head and patch need linking/);
    });

    await t.test('refuses unknown names', async () => {
        const { code, stderr } = await runBin('httpc', ['link', 'banana']);
        assert.equal(code, 2);
        assert.match(stderr, /banana is not an opt-in shortcut/);
    });

    await t.test('unlinking something we never linked is not an error', async () => {
        const { code, stderr } = await runBin('httpc', ['unlink', 'head'], {
            // An empty PATH makes the shim lookup fall back without touching real dirs.
            env: { PATH: '' },
        });
        assert.equal(code, 0);
        assert.match(stderr, /head is not linked by httpc/);
    });
});

test('URL shorthands', async (t) => {
    await t.test('a leading colon means localhost', async () => {
        const { code, stdout } = await runBin('get', [`:${server.port}/echo`]);
        assert.equal(code, 0);
        assert.equal(echo(stdout).url, '/echo');
    });

    await t.test('a bare host:port gets http://', async () => {
        const { code } = await runBin('get', [`127.0.0.1:${server.port}/echo`]);
        assert.equal(code, 0);
    });
});
