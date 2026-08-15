import test from 'node:test';
import assert from 'node:assert/strict';

import { parseItem, parseItems, isBodyItem } from '../src/items.ts';
import { CliError, EXIT } from '../src/errors.ts';

test('headers', async (t) => {
    await t.test('simple header', () => {
        assert.deepEqual(parseItem('X-Api-Key:secret'), { kind: 'header', name: 'X-Api-Key', value: 'secret' });
    });

    await t.test('value may contain further colons', () => {
        assert.deepEqual(parseItem('X-Foo:a:b'), { kind: 'header', name: 'X-Foo', value: 'a:b' });
    });

    await t.test('value may contain spaces', () => {
        assert.deepEqual(parseItem('Authorization:Bearer abc'), {
            kind: 'header',
            name: 'Authorization',
            value: 'Bearer abc',
        });
    });

    await t.test('bare colon unsets a default header', () => {
        assert.deepEqual(parseItem('Accept:'), { kind: 'header', name: 'Accept', value: null });
    });

    await t.test('semicolon sends an empty value', () => {
        assert.deepEqual(parseItem('Accept;'), { kind: 'header', name: 'Accept', value: '' });
    });
});

test('query parameters', async (t) => {
    await t.test('== beats = at the same index', () => {
        assert.deepEqual(parseItem('a==b'), { kind: 'query', name: 'a', value: 'b' });
    });

    await t.test('value may contain a whole URL', () => {
        assert.deepEqual(parseItem('url==https://x.com/a?b=c'), {
            kind: 'query',
            name: 'url',
            value: 'https://x.com/a?b=c',
        });
    });

    await t.test('empty value is allowed', () => {
        assert.deepEqual(parseItem('flag=='), { kind: 'query', name: 'flag', value: '' });
    });
});

test('body fields', async (t) => {
    await t.test('string field', () => {
        assert.deepEqual(parseItem('name=Alice'), { kind: 'field', name: 'name', value: 'Alice' });
    });

    await t.test('empty string field', () => {
        assert.deepEqual(parseItem('name='), { kind: 'field', name: 'name', value: '' });
    });

    await t.test('= at index 5 beats @ at index 7', () => {
        assert.deepEqual(parseItem('email=a@b.com'), { kind: 'field', name: 'email', value: 'a@b.com' });
    });
});

test('raw JSON fields', async (t) => {
    await t.test(':= beats : at the same index', () => {
        assert.deepEqual(parseItem('n:=5'), { kind: 'raw', name: 'n', value: 5 });
    });

    await t.test('arrays', () => {
        assert.deepEqual(parseItem('tags:=["a","b"]'), { kind: 'raw', name: 'tags', value: ['a', 'b'] });
    });

    await t.test('objects', () => {
        assert.deepEqual(parseItem('meta:={"a":1}'), { kind: 'raw', name: 'meta', value: { a: 1 } });
    });

    await t.test('booleans and null', () => {
        assert.deepEqual(parseItem('ok:=true'), { kind: 'raw', name: 'ok', value: true });
        assert.deepEqual(parseItem('gone:=null'), { kind: 'raw', name: 'gone', value: null });
    });

    await t.test('malformed JSON is a usage error naming the item', () => {
        assert.throws(
            () => parseItem('n:={oops'),
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.equal(err.code, EXIT.USAGE);
                assert.match(err.message, /invalid JSON value for 'n'/);
                assert.match(String(err.hint), /n:=\{oops/);
                return true;
            },
        );
    });
});

test('file items', async (t) => {
    await t.test('@ is a multipart upload', () => {
        assert.deepEqual(parseItem('doc@./cv.pdf'), { kind: 'file', name: 'doc', path: './cv.pdf' });
    });

    await t.test('=@ beats = at the same index', () => {
        assert.deepEqual(parseItem('bio=@bio.txt'), { kind: 'fieldFile', name: 'bio', path: 'bio.txt' });
    });

    await t.test(':=@ beats := and =@', () => {
        assert.deepEqual(parseItem('meta:=@meta.json'), { kind: 'rawFile', name: 'meta', path: 'meta.json' });
    });
});

test('escaping', async (t) => {
    await t.test('escaped @ keeps the later == as the separator', () => {
        assert.deepEqual(parseItem('a\\@b==c'), { kind: 'query', name: 'a@b', value: 'c' });
    });

    await t.test('escaped = is part of the name', () => {
        assert.deepEqual(parseItem('a\\=b=c'), { kind: 'field', name: 'a=b', value: 'c' });
    });

    await t.test('escaped : is part of the name', () => {
        assert.deepEqual(parseItem('weird\\:key=value'), { kind: 'field', name: 'weird:key', value: 'value' });
    });

    await t.test('backslashes before non-separators are preserved (Windows paths)', () => {
        assert.deepEqual(parseItem('path=C:\\tmp\\x'), { kind: 'field', name: 'path', value: 'C:\\tmp\\x' });
    });

    await t.test('a literal backslash can be escaped', () => {
        assert.deepEqual(parseItem('a\\\\b=c'), { kind: 'field', name: 'a\\b', value: 'c' });
    });
});

test('malformed items', async (t) => {
    await t.test('a token with no separator is rejected', () => {
        assert.throws(
            () => parseItem('justapositional'),
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.equal(err.code, EXIT.USAGE);
                assert.match(err.message, /not a valid request item: justapositional/);
                return true;
            },
        );
    });

    await t.test('an empty name is rejected', () => {
        assert.throws(() => parseItem('=value'), CliError);
        assert.throws(() => parseItem(':value'), CliError);
    });

    await t.test('a lone semicolon is not a header', () => {
        assert.throws(() => parseItem(';'), CliError);
    });
});

test('parseItems maps in order', () => {
    const items = parseItems(['X-A:1', 'q==2', 'f=3']);
    assert.deepEqual(items.map((i) => i.kind), ['header', 'query', 'field']);
});

test('isBodyItem excludes headers and query params', () => {
    assert.equal(isBodyItem(parseItem('X-A:1')), false);
    assert.equal(isBodyItem(parseItem('q==2')), false);
    assert.equal(isBodyItem(parseItem('f=3')), true);
    assert.equal(isBodyItem(parseItem('f:=3')), true);
    assert.equal(isBodyItem(parseItem('f@p')), true);
});
