// The W3C web-platform-tests conformance corpus: 222 files, each forked into
// its own process by the vendored runner so a crash or a hang in one cannot
// take the rest down.
//
// The runner and the corpus under test/wpt/ are kept as plain JavaScript, close
// to how they arrive from web-platform-tests, so they can be re-synced with
// `node test/wpt/convert.js` without a translation step in between. Everything
// else in this package is TypeScript.
//
// Expected results live in test/wpt/manifests/*.toml: a test known to fail is
// recorded there rather than deleted, so a fix shows up as an unexpected pass.
import "./wpt/run-all.js";
