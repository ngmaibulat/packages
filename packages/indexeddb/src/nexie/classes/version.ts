import { parseStoresSpec } from './schema-parser.ts';
import { promisableChain } from '../functions/chaining.ts';
import type { Nexie } from './nexie.ts';
import type { Transaction } from './transaction.ts';
import type { DbSchema } from '../types/schema.ts';

export interface VersionConfig {
    version: number;
    storesSource: Record<string, string | null> | null;
    dbschema: DbSchema;
    /** Data migration for this version, composed across repeated calls. */
    contentUpgrade: ((trans: any) => unknown) | null;
}

export class Version {
    readonly db: Nexie;
    readonly _cfg: VersionConfig;

    constructor(db: Nexie, versionNumber: number) {
        this.db = db;
        this._cfg = {
            version: versionNumber,
            storesSource: null,
            dbschema: {},
            contentUpgrade: null,
        };
    }

    /**
     * Declare the schema for this version.
     *
     * Specs are cumulative: every registered version is re-parsed in ascending
     * order and merged, so version 2 inherits version 1's tables without
     * restating them. A table mapped to `null` is dropped from that version on.
     */
    stores(stores: Record<string, string | null>): this {
        const db = this.db;

        this._cfg.storesSource = this._cfg.storesSource
            ? { ...this._cfg.storesSource, ...stores }
            : stores;

        const accumulated: Record<string, string | null> = {};
        let dbschema: DbSchema = {};

        for (const version of db._versions) {
            Object.assign(accumulated, version._cfg.storesSource);
            dbschema = version._cfg.dbschema = {};
            parseStoresSpec(accumulated, dbschema);
        }

        db._dbSchema = dbschema;
        db._storeNames = Object.keys(dbschema);
        db._installTableApi();

        return this;
    }

    /**
     * Migrate data into this version's shape.
     *
     * Runs inside the version-change transaction, after this version's
     * structural changes and before the next version's. Returning a promise
     * holds the upgrade open until it settles, and calling `upgrade()` more
     * than once composes the functions in order rather than replacing.
     */
    upgrade(fn: (trans: Transaction) => unknown): this {
        const previous = this._cfg.contentUpgrade;
        this._cfg.contentUpgrade = previous
            ? (promisableChain(previous, fn) as (trans: unknown) => unknown)
            : (fn as (trans: unknown) => unknown);
        return this;
    }
}
