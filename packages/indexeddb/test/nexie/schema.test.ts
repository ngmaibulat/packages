import { describe as suite, it as test } from 'node:test';
import { assert } from 'chai';

import {
    parseIndexSyntax,
    parseStoresSpec,
} from '../../src/nexie/classes/schema-parser.ts';
import type { DbSchema } from '../../src/nexie/types/schema.ts';

suite('schema DSL', () => {
    test('the first entry is the primary key', () => {
        const [primKey, ...indexes] = parseIndexSyntax('id, name, age');
        assert.strictEqual(primKey!.name, 'id');
        assert.deepEqual(
            indexes.map((i) => i.name),
            ['name', 'age'],
        );
    });

    test('++ marks an auto-incrementing inbound primary key', () => {
        const [primKey] = parseIndexSyntax('++id, name');
        assert.strictEqual(primKey!.name, 'id');
        assert.strictEqual(primKey!.keyPath, 'id');
        assert.isTrue(primKey!.auto);
    });

    test('a bare ++ is an auto-incrementing OUTBOUND primary key', () => {
        const [primKey] = parseIndexSyntax('++, name');
        assert.strictEqual(primKey!.keyPath, null, 'outbound');
        assert.isTrue(primKey!.auto);
    });

    test('a leading comma is an outbound primary key', () => {
        const [primKey] = parseIndexSyntax(', name, age');
        assert.strictEqual(primKey!.keyPath, null);
        assert.isFalse(primKey!.auto);
    });

    test('& marks a unique index', () => {
        const [, email] = parseIndexSyntax('id, &email');
        assert.strictEqual(email!.name, 'email');
        assert.isTrue(email!.unique);
        assert.isFalse(email!.multi);
    });

    test('* marks a multiEntry index', () => {
        const [, tags] = parseIndexSyntax('id, *tags');
        assert.strictEqual(tags!.name, 'tags');
        assert.isTrue(tags!.multi);
    });

    test('[a+b] becomes a compound keyPath', () => {
        const [, compound] = parseIndexSyntax('id, [first+last]');
        assert.strictEqual(compound!.name, '[first+last]');
        assert.deepEqual(compound!.keyPath, ['first', 'last']);
        assert.isTrue(compound!.compound);
    });

    test('&[a+b] is a unique compound index', () => {
        const [, compound] = parseIndexSyntax('id, &[first+last]');
        assert.isTrue(compound!.unique);
        assert.isTrue(compound!.compound);
    });

    test('name:Type keeps the type suffix off the name', () => {
        const [, typed] = parseIndexSyntax('id, notes:Y');
        assert.strictEqual(typed!.name, 'notes');
        assert.strictEqual(typed!.type, 'Y');
    });

    test('whitespace around parts and types is trimmed', () => {
        const specs = parseIndexSyntax('  ++id ,  name  ,  notes : Y  ');
        assert.strictEqual(specs[0]!.name, 'id');
        assert.strictEqual(specs[1]!.name, 'name');
        assert.strictEqual(specs[2]!.name, 'notes');
        assert.strictEqual(specs[2]!.type, 'Y');
    });

    test('src is regenerated canonically, not echoed', () => {
        const specs = parseIndexSyntax('++id, &email, *tags, [a+b]');
        assert.strictEqual(specs[0]!.src, '++id');
        assert.strictEqual(specs[1]!.src, '&email');
        assert.strictEqual(specs[2]!.src, '*tags');
        assert.strictEqual(specs[3]!.src, '[a+b]');
    });
});

suite('parseStoresSpec', () => {
    function parse(stores: Record<string, string | null>): DbSchema {
        const schema: DbSchema = {};
        parseStoresSpec(stores, schema);
        return schema;
    }

    test('builds a table schema with an index lookup', () => {
        const schema = parse({ friends: '++id, name, &email' });
        const friends = schema['friends']!;
        assert.strictEqual(friends.name, 'friends');
        assert.strictEqual(friends.primKey.name, 'id');
        assert.deepEqual(
            friends.indexes.map((i) => i.name),
            ['name', 'email'],
        );
        assert.strictEqual(friends.idxByName['email']!.unique, true);
    });

    test('a primary key is unique even without &', () => {
        assert.isTrue(parse({ t: 'id' })['t']!.primKey.unique);
    });

    test('a null spec drops the table', () => {
        const schema = parse({ keep: 'id', drop: null });
        assert.exists(schema['keep']);
        assert.notExists(schema['drop']);
    });

    test('rejects a multiEntry primary key', () => {
        assert.throws(
            () => parse({ t: '*id, name' }),
            /Primary key cannot be multiEntry/,
        );
    });

    test('rejects ++ on a secondary index', () => {
        assert.throws(
            () => parse({ t: 'id, ++other' }),
            /Only primary key can be marked as autoIncrement/,
        );
    });

    test('rejects an empty secondary index name', () => {
        assert.throws(
            () => parse({ t: 'id, , name' }),
            /Index must have a name/,
        );
    });
});
