// Importing this module for its side effect installs the implementation onto
// the global object, so code under test can use `indexedDB` as if it were
// running in a browser:
//
//     import "@aibulat/indexeddb-impl/auto";
//
// Upstream shipped this as a hand-written `auto/index.mjs` next to a CJS twin,
// both naming files inside `build/`. Here it is a normal entry point that
// tsdown builds like any other, so there is nothing to keep in step by hand.
//
// The work lives in install.ts so it can also be called directly -- see
// installGlobals() for why that matters under a shared-process test runner.

import { installGlobals } from "./install.ts";

installGlobals();
