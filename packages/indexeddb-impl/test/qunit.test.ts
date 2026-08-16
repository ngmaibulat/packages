// The indexedDBmock corpus, which upstream could only run in a browser.
//
// See test/harness/qunit.ts for how the QUnit API and the shared script-tag
// scope are reproduced. This file supplies the browser globals the corpus
// reaches for and the load order the original index.html used.

import { fileURLToPath } from "node:url";
import { indexedDB, IDBKeyRange } from "../src/index.ts";
import { runQUnitSuite } from "./harness/qunit.ts";

// The original index.html loaded these in this order, and it matters: setup.js
// declares the fixtures and helpers the other eight close over.
const FILES = [
    "setup.js",
    "database.js",
    "transaction.js",
    "objectstore.js",
    "index.js",
    "objectstore.add.js",
    "objectstore.put.js",
    "objectstore.get.js",
    "keyrange.js",
].map((name) =>
    fileURLToPath(new URL(`./qunit/suite/${name}`, import.meta.url)),
);

// setup.js picks the implementation under test with
// `getParameterByName("imp") ? window.indexedDB : window.indexedDBmock`, which
// is how the original page let you re-run the same corpus against the browser's
// native IndexedDB for comparison. An empty query string selects the mock,
// which here is us.
const window = {
    indexedDBmock: indexedDB,
    IDBKeyRangemock: IDBKeyRange,
    indexedDB,
    IDBKeyRange,
};

runQUnitSuite(FILES, {
    window,
    location: { search: "" },
});
