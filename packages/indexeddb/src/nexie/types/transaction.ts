/**
 * The mode strings, kept exactly as Dexie spells them because migrated code
 * passes them as literals.
 *
 *   'r' / 'readonly'    a read transaction
 *   'rw' / 'readwrite'  a write transaction
 *   '!'                 never reuse an ongoing parent transaction
 *   '?'                 reuse the parent only if compatible, else start a new one
 */
export type TransactionMode =
    | 'readonly'
    | 'readwrite'
    | 'r'
    | 'r!'
    | 'r?'
    | 'rw'
    | 'rw!'
    | 'rw?';

/** What the mode string decomposes into. */
export interface ParsedMode {
    idbMode: IDBTransactionMode;
    /** `!` -- always start a fresh transaction. */
    forceNew: boolean;
    /** `?` -- reuse only when compatible, rather than failing. */
    lenient: boolean;
}
