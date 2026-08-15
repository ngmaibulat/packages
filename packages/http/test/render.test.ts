import test from 'node:test';
import assert from 'node:assert/strict';

import { createStyles, stripAnsi, supportsColor, supportsFormatting } from '../src/color.ts';
import { formatJson, tryParseJson } from '../src/json.ts';
import { baseType, guessMime, isJsonType, isTextType } from '../src/mime.ts';
import { deriveDownloadFilename, formatBytes, sanitizeFilename } from '../src/render.ts';

test('JSON content-type detection', async (t) => {
    const json = [
        'application/json',
        'application/json; charset=utf-8',
        'APPLICATION/JSON',
        'text/json',
        'application/vnd.api+json',
        'application/problem+json',
        'application/ld+json',
    ];

    const notJson = ['text/html', 'text/plain', 'application/xml', 'image/png', '', null, undefined];

    for (const value of json) {
        await t.test(`matches ${String(value)}`, () => assert.equal(isJsonType(value), true));
    }

    for (const value of notJson) {
        await t.test(`rejects ${String(value)}`, () => assert.equal(isJsonType(value), false));
    }
});

test('text content-type detection', () => {
    assert.equal(isTextType('text/plain'), true);
    assert.equal(isTextType('text/csv; charset=utf-8'), true);
    assert.equal(isTextType('application/json'), true);
    assert.equal(isTextType('application/xml'), true);
    assert.equal(isTextType('application/atom+xml'), true);
    assert.equal(isTextType('image/svg+xml'), true);
    assert.equal(isTextType('image/png'), false);
    assert.equal(isTextType('application/octet-stream'), false);
    assert.equal(isTextType(null), false);
});

test('baseType strips parameters', () => {
    assert.equal(baseType('application/json; charset=utf-8'), 'application/json');
    assert.equal(baseType('  TEXT/HTML  '), 'text/html');
    assert.equal(baseType(null), '');
});

test('guessMime', () => {
    assert.equal(guessMime('a/b/c.json'), 'application/json');
    assert.equal(guessMime('photo.PNG'), 'image/png');
    assert.equal(guessMime('archive.tar'), 'application/x-tar');
    assert.equal(guessMime('mystery'), 'application/octet-stream');
    assert.equal(guessMime('mystery.qqq'), 'application/octet-stream');
});

test('formatJson', async (t) => {
    const sample = {
        name: 'Alice',
        age: 30,
        active: true,
        missing: null,
        tags: ['a', 'b'],
        nested: { deep: { deeper: [1, 2, 3] } },
        empty: {},
        emptyList: [],
    };

    await t.test('uncoloured output matches JSON.stringify exactly', () => {
        assert.equal(formatJson(sample, null), JSON.stringify(sample, null, 2));
    });

    await t.test('coloured output is identical once SGR codes are stripped', () => {
        const coloured = formatJson(sample, createStyles(true));
        assert.notEqual(coloured, JSON.stringify(sample, null, 2));
        assert.equal(stripAnsi(coloured), JSON.stringify(sample, null, 2));
    });

    await t.test('braces inside string values are not mistaken for structure', () => {
        // The reason this walks the parsed value instead of regexing stringify output.
        const tricky = { note: '{"looks":"like json"}', other: 'a "quoted" word' };
        assert.equal(stripAnsi(formatJson(tricky, createStyles(true))), JSON.stringify(tricky, null, 2));
    });

    await t.test('scalars at the top level', () => {
        assert.equal(formatJson('hi', null), '"hi"');
        assert.equal(formatJson(42, null), '42');
        assert.equal(formatJson(null, null), 'null');
        assert.equal(formatJson(true, null), 'true');
    });

    await t.test('respects a custom indent', () => {
        assert.equal(formatJson({ a: 1 }, null, 4), JSON.stringify({ a: 1 }, null, 4));
    });
});

test('tryParseJson', () => {
    assert.deepEqual(tryParseJson('{"a":1}'), { value: { a: 1 } });
    assert.equal(tryParseJson('{nope'), undefined);
});

test('colour detection', async (t) => {
    const env = (extra: Record<string, string | undefined> = {}) => ({ isTTY: true, env: extra });

    await t.test('follows the TTY by default', () => {
        assert.equal(supportsColor(undefined, { isTTY: true, env: {} }), true);
        assert.equal(supportsColor(undefined, { isTTY: false, env: {} }), false);
    });

    await t.test('NO_COLOR disables it', () => {
        assert.equal(supportsColor(undefined, env({ NO_COLOR: '1' })), false);
        // An empty value does not count, per the NO_COLOR convention.
        assert.equal(supportsColor(undefined, env({ NO_COLOR: '' })), true);
    });

    await t.test('FORCE_COLOR enables it even when piped', () => {
        assert.equal(supportsColor(undefined, { isTTY: false, env: { FORCE_COLOR: '1' } }), true);
        assert.equal(supportsColor(undefined, { isTTY: true, env: { FORCE_COLOR: '0' } }), false);
    });

    await t.test('TERM=dumb disables it', () => {
        assert.equal(supportsColor(undefined, env({ TERM: 'dumb' })), false);
    });

    await t.test('--pretty overrides everything', () => {
        assert.equal(supportsColor('none', env({ FORCE_COLOR: '1' })), false);
        assert.equal(supportsColor('all', env({ NO_COLOR: '1' })), true);
        assert.equal(supportsColor('colors', { isTTY: false, env: {} }), true);
        assert.equal(supportsColor('format', { isTTY: true, env: {} }), false);
    });

    await t.test('formatting is orthogonal to colour', () => {
        assert.equal(supportsFormatting(undefined), true);
        assert.equal(supportsFormatting('all'), true);
        assert.equal(supportsFormatting('format'), true);
        assert.equal(supportsFormatting('colors'), false);
        assert.equal(supportsFormatting('none'), false);
    });
});

test('styles are the identity function when disabled', () => {
    const plain = createStyles(false);
    assert.equal(plain.red('x'), 'x');
    assert.equal(plain.bold('x'), 'x');

    const coloured = createStyles(true);
    assert.notEqual(coloured.red('x'), 'x');
    assert.equal(stripAnsi(coloured.red('x')), 'x');
});

test('download filename derivation', async (t) => {
    const headers = (value?: string): Headers =>
        value === undefined ? new Headers() : new Headers({ 'content-disposition': value });

    await t.test('plain filename=', () => {
        assert.equal(
            deriveDownloadFilename(headers('attachment; filename="report.csv"'), new URL('http://x/a/b')),
            'report.csv',
        );
    });

    await t.test('unquoted filename=', () => {
        assert.equal(deriveDownloadFilename(headers('attachment; filename=report.csv'), new URL('http://x/')), 'report.csv');
    });

    await t.test('RFC 5987 filename* wins and is percent-decoded', () => {
        assert.equal(
            deriveDownloadFilename(
                headers("attachment; filename=\"fallback.txt\"; filename*=UTF-8''r%C3%A9sum%C3%A9.txt"),
                new URL('http://x/'),
            ),
            'résumé.txt',
        );
    });

    await t.test('falls back to the final URL path segment', () => {
        assert.equal(deriveDownloadFilename(headers(), new URL('http://x/files/data.tar.gz')), 'data.tar.gz');
    });

    await t.test('falls back to index.html for a bare origin', () => {
        assert.equal(deriveDownloadFilename(headers(), new URL('http://x/')), 'index.html');
    });

    await t.test('a server cannot choose a path', () => {
        assert.equal(
            deriveDownloadFilename(headers('attachment; filename="../../etc/passwd"'), new URL('http://x/')),
            'passwd',
        );
        assert.equal(
            deriveDownloadFilename(headers('attachment; filename="/abs/evil.sh"'), new URL('http://x/')),
            'evil.sh',
        );
    });
});

test('sanitizeFilename', () => {
    assert.equal(sanitizeFilename('ok.txt'), 'ok.txt');
    assert.equal(sanitizeFilename('../escape'), 'escape');
    assert.equal(sanitizeFilename('.hidden'), 'hidden');
    assert.equal(sanitizeFilename('a:b?c*d'), 'a_b_c_d');
    assert.equal(sanitizeFilename('..'), 'index.html');
    assert.equal(sanitizeFilename('C:\\windows\\path.txt'), 'path.txt');
});

test('formatBytes', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(999), '999 B');
    assert.equal(formatBytes(1000), '1.0 kB');
    assert.equal(formatBytes(1536), '1.5 kB');
    assert.equal(formatBytes(12400), '12 kB');
    assert.equal(formatBytes(5_000_000), '5.0 MB');
});
