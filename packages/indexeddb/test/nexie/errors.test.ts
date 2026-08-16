import { describe as suite, it as test } from 'node:test';
import { assert } from 'chai';

import {
    errnames,
    exceptions,
    fullNameExceptions,
    mapError,
    NexieError,
} from '../../src/nexie/errors/errors.ts';
import { NexiePromise } from '../../src/nexie/zone/nexie-promise.ts';

suite('NexieError', () => {
    test('carries name, message and toString', () => {
        const error = new exceptions['OpenFailed']!('could not open');
        assert.instanceOf(error, NexieError);
        assert.instanceOf(error, Error);
        assert.strictEqual(error.name, 'OpenFailedError');
        assert.strictEqual(error.message, 'could not open');
        assert.strictEqual(String(error), 'OpenFailedError: could not open');
    });

    test('the class itself is named, not "GeneratedError"', () => {
        assert.strictEqual(exceptions['Constraint']!.name, 'ConstraintError');
    });

    test('accepts the bare (inner) form', () => {
        const inner = new Error('underlying');
        const error = new exceptions['Upgrade']!(inner);
        assert.strictEqual(error.message, 'underlying');
        assert.strictEqual(error.inner, inner);
    });

    test('accepts the (message, inner) form', () => {
        const inner = new Error('underlying');
        const error = new exceptions['Upgrade']!('wrapper', inner);
        assert.strictEqual(error.message, 'wrapper');
        assert.strictEqual(error.inner, inner);
    });

    test('supplies a default message where upstream does', () => {
        assert.strictEqual(
            new exceptions['DatabaseClosed']!().message,
            'Database has been closed',
        );
        assert.strictEqual(
            new exceptions['Abort']!().message,
            'Transaction aborted',
        );
    });
});

suite('errnames', () => {
    // These strings are the migration contract: `.catch('OpenFailedError', h)`
    // matches on them, so they must stay exactly as Dexie spells them.
    test('maps short names to full names', () => {
        assert.strictEqual(errnames['OpenFailed'], 'OpenFailedError');
        assert.strictEqual(errnames['Constraint'], 'ConstraintError');
        assert.strictEqual(errnames['ForeignAwait'], 'ForeignAwaitError');
        assert.strictEqual(errnames['PrematureCommit'], 'PrematureCommitError');
    });

    test('covers both the Nexie-specific and the IDB-mapped lists', () => {
        for (const short of [
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
        ]) {
            assert.strictEqual(errnames[short], `${short}Error`, short);
        }

        for (const short of [
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
        ]) {
            assert.strictEqual(errnames[short], `${short}Error`, short);
        }
    });

    test('fullNameExceptions is keyed for mixing onto the constructor', () => {
        assert.isFunction(fullNameExceptions['ConstraintError']);
        assert.isFunction(fullNameExceptions['OpenFailedError']);
        assert.isFunction(fullNameExceptions['NexieError']);
    });
});

suite('mapError', () => {
    /** A DOMException-shaped object, as IndexedDB would hand us. */
    function domError(name: string, message: string) {
        const error = new Error(message);
        error.name = name;
        return error;
    }

    test('converts a DOM error name into the matching class', () => {
        const mapped = mapError(domError('ConstraintError', 'dup key'));
        assert.instanceOf(mapped, NexieError);
        assert.instanceOf(mapped, exceptions['Constraint']!);
        assert.strictEqual((mapped as NexieError).name, 'ConstraintError');
        assert.strictEqual((mapped as NexieError).message, 'dup key');
    });

    test('keeps the original as inner and reuses its stack', () => {
        const original = domError('AbortError', 'aborted');
        const mapped = mapError(original) as NexieError;
        assert.strictEqual(mapped.inner, original);
        assert.strictEqual((mapped as unknown as Error).stack, original.stack);
    });

    test('passes through an unrecognised name unchanged', () => {
        const other = domError('SomethingElseError', 'huh');
        assert.strictEqual(mapError(other), other);
    });

    test('passes through an already-mapped NexieError unchanged', () => {
        const already = new exceptions['Constraint']!('dup');
        assert.strictEqual(mapError(already), already);
    });

    test('tolerates null and undefined', () => {
        assert.strictEqual(mapError(null), null);
        assert.strictEqual(mapError(undefined), undefined);
    });
});

suite('rejectionMapper wiring', () => {
    // Importing errors.ts installs mapError globally, which is what lets a raw
    // DOMException be caught as a Nexie class without conversion at the throw site.
    test('a rejected DOM error arrives as a Nexie class', async () => {
        const raw = new Error('dup key');
        raw.name = 'ConstraintError';

        let caught: unknown;
        await new NexiePromise<never>((_, reject) => reject(raw)).catch((e) => {
            caught = e;
        });

        assert.instanceOf(caught, exceptions['Constraint']!);
        assert.strictEqual((caught as NexieError).inner, raw);
    });

    test('and is catchable by name and by constructor', async () => {
        const raw = new Error('dup key');
        raw.name = 'ConstraintError';

        const byName = await NexiePromise.reject(raw).catch(
            'ConstraintError',
            () => 'by name',
        );
        assert.strictEqual(byName, 'by name');

        const raw2 = new Error('dup key');
        raw2.name = 'ConstraintError';
        const byClass = await NexiePromise.reject(raw2).catch(
            exceptions['Constraint']!,
            () => 'by class',
        );
        assert.strictEqual(byClass, 'by class');
    });
});
