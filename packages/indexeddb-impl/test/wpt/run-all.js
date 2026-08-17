/* eslint-env node */
import { describe, test } from "node:test";
import path from "node:path";
import * as fs from "node:fs";
import { parse, stringify } from "smol-toml";
import { glob } from "glob";
import { runTestFile } from "./runTestFile.js";

const generateManifests = process.env.GENERATE_MANIFESTS;

// Resolved from this file rather than the working directory. Upstream
// hardcoded a cwd-relative path, so the suite only ran from the package
// root; `node --test` and the pnpm -r runner do not guarantee that.
const __dirname = import.meta.dirname;
const testFolder = path.join(__dirname, "converted");
const manifestsFolder = path.join(__dirname, "manifests");

// Which runtime we are on, for the per-runtime manifest overrides below.
//
// Upstream keyed these on `node${major}` from process.version. Bun reports a
// *Node* version there (v24 at the time of writing) that says nothing about
// Bun's own behaviour, so on Bun that key would silently select a Node
// override -- or, once a node24 directory existed, apply Node's expectations to
// Bun. Both runtimes currently agree and no overrides exist; if one ever
// diverges, prefer fixing it over recording it here.
const runtimeKey =
    typeof globalThis.Bun !== "undefined"
        ? `bun${globalThis.Bun.version.split(".")[0]}`
        : `node${parseInt(process.version.substring(1).split(".")[0])}`;

const filenames = glob.sync("/**/*.js", { root: testFolder });

function parseManifest(manifestFilename) {
    const text =
        fs.existsSync(manifestFilename) &&
        fs.readFileSync(manifestFilename, "utf-8");
    if (!text) {
        return;
    }
    const contents = parse(text);
    // we want to preserve comments, and smol-toml has no way to extract them
    const comments = text.split("\n").filter((line) => line.startsWith("#"));
    return { contents, comments };
}

function stringifyManifest(generatedManifest, comments) {
    return (
        (comments?.length > 0 ? comments.join("\n") + "\n" : "") +
        stringify(generatedManifest)
    );
}

let numExpectedFailures = 0;
let numExpectedTimeouts = 0;
let numUnstableTests = 0;
let numPassedTests = 0;

const timeout = 5000;

for (const absFilename of filenames) {
    const filename = path.relative(testFolder, absFilename);

    const generatedManifest = {};

    const manifestBasename = filename.replace(/\.js$/, ".toml");
    const manifestFilename = path.join(manifestsFolder, manifestBasename);
    // if any tests are failing only in older node versions, they go in the override
    const overrideManifestFilename = path.join(
        manifestsFolder,
        `overrides/${runtimeKey}`,
        manifestBasename,
    );
    const expectedManifest = fs.existsSync(overrideManifestFilename)
        ? parseManifest(overrideManifestFilename)
        : parseManifest(manifestFilename);
    const skip = expectedManifest?.contents?.skip;

    if (skip) {
        generatedManifest.skip = true;
    }

    // The child process is run BEFORE any test is registered, so that each WPT
    // assertion becomes a sibling test inside a describe() rather than a
    // test-inside-a-test. Upstream nested them, which node:test allows and Bun
    // does not (oven-sh/bun#5090) -- and running both runners is the point of
    // this fork. The grouping in the output is unchanged.
    if (skip) {
        // A skipped top-level test reports as "# SKIP"; a skipped describe is
        // silently absent from the tally, which would make a growing skip list
        // invisible.
        test(filename, { skip: true }, () => {});
        continue;
    }

    // A child that dies before printing anything -- a syntax error, or a
    // polyfill that throws on this runtime -- used to reject out of this loop
    // and abort registration for every file after it. The run then reported a
    // single error and a much smaller test count, which reads like "fewer tests
    // exist" rather than "the suite stopped early". Now it is one failing test.
    let stdout, stderr, timedOut;
    try {
        ({ stdout, stderr, timedOut } = await runTestFile(filename, {
            cwd: testFolder,
            timeout,
        }));
    } catch (error) {
        describe(filename, () => {
            test("ran to completion", () => {
                throw error;
            });
        });
        continue;
    }
    if (timedOut) {
        generatedManifest.expectTimeout = true;
    }
    if (stderr) {
        console.error(`stderr: ${stderr}`);
    }
    const results = {};
    const resultLines = stdout
        .split("\n")
        .filter((_) => _.includes("testResult"))
        .map((_) => JSON.parse(_));
    // A duplicate result is a verdict, not a throw: thrown from here it would
    // abort registration for every file after this one, which is exactly the
    // failure mode the try/catch above exists to prevent.
    const duplicates = [];
    for (const resultLine of resultLines) {
        for (const name of Object.keys(resultLine.testResult)) {
            if (name in results) duplicates.push(name);
        }
        Object.assign(results, resultLine.testResult);
    }

    // Verdicts are computed here, synchronously, rather than inside the test
    // callbacks. Two reasons: the computation is pure (it only compares the
    // child's results against the manifest), and the manifest regeneration
    // below has to observe every verdict -- test callbacks run long after this
    // loop iteration, so anything they wrote would come too late.
    const verdicts = [];

    for (const name of duplicates) {
        verdicts.push({
            name: `no duplicate results for ${name}`,
            error: new Error(`Duplicate test results for ${name}`),
        });
    }

    if (!Object.keys(results).length && !generatedManifest.expectTimeout) {
        verdicts.push({
            name: "produced test results",
            error: new Error("Did not receive any test results from test"),
        });
    }

    for (const [name, result] of Object.entries(results)) {
        const expectation = expectedManifest?.contents?.[name]?.expectation;
        const friendlyText =
            expectation === "FAIL"
                ? " (expected failure)"
                : expectation === "UNSTABLE"
                  ? " (expected unstable)"
                  : "";
        let error = null;

        if (expectation === "UNSTABLE") {
            // if the test is unstable, make no assumptions about the pass/fail
            // state and move on
            generatedManifest[name] = { expectation: "UNSTABLE" };
            numUnstableTests += 1;
        } else if (result.passed) {
            if (expectation === "FAIL") {
                error = new Error("Expected test to fail, but it passed");
            } else {
                numPassedTests += 1;
            }
        } else {
            generatedManifest[name] = { expectation: "FAIL" };
            if (expectation === "FAIL") {
                numExpectedFailures += 1;
            } else {
                error = new Error(result.error);
            }
        }

        verdicts.push({ name: `${name}${friendlyText}`, error });
    }

    // A file that may time out reports whatever it printed before it was
    // killed, so the number of verdicts would vary run to run -- and with it
    // the suite's total, which the Node/Bun parity check treats as a signal.
    // The manifest lists the file's tests (`expectedTests`), and any name that
    // did not report is registered anyway, so the count is fixed.
    const expectedTests = expectedManifest?.contents?.expectedTests ?? [];
    for (const name of expectedTests) {
        if (name in results) continue;
        const tolerated =
            expectedManifest?.contents?.expectTimeout === "UNSTABLE" ||
            expectedManifest?.contents?.expectTimeout === true;
        verdicts.push({
            name: `${name} (not reported before timeout)`,
            error: tolerated
                ? null
                : new Error(`Expected a result for "${name}" but got none`),
        });
    }
    if (
        generateManifests &&
        (generatedManifest.expectTimeout ||
            expectedManifest?.contents?.expectTimeout)
    ) {
        generatedManifest.expectedTests = [
            ...new Set([...expectedTests, ...Object.keys(results)]),
        ].sort();
    }

    let timingError = null;
    if (expectedManifest?.contents?.expectTimeout === "UNSTABLE") {
        // If the timeout is unstable, then don't pass/fail based on whether we
        // actually got a timeout or not
        generatedManifest.expectTimeout = "UNSTABLE";
        numExpectedTimeouts += 1;
    } else if (generatedManifest.expectTimeout) {
        if (expectedManifest?.contents?.expectTimeout) {
            numExpectedTimeouts += 1;
        } else {
            timingError = new Error("Test file timed out before completion");
        }
    } else if (expectedManifest?.contents?.expectTimeout) {
        timingError = new Error("Expected test file to time out, but it didn't");
    }
    if (timingError) {
        verdicts.push({ name: "file completed as expected", error: timingError });
    }

    describe(filename, () => {
        for (const verdict of verdicts) {
            test(verdict.name, () => {
                if (verdict.error) throw verdict.error;
            });
        }
    });

    if (generateManifests) {
        fs.mkdirSync(path.dirname(manifestFilename), { recursive: true });
        if (Object.keys(generatedManifest).length) {
            // Sort to avoid issues where some tests complete before others in
            // non-deterministic order
            const sortedGeneratedManifest = Object.fromEntries(
                Object.keys(generatedManifest)
                    .sort()
                    .map((key) => [key, generatedManifest[key]]),
            );
            fs.writeFileSync(
                manifestFilename,
                stringifyManifest(
                    sortedGeneratedManifest,
                    expectedManifest?.comments,
                ),
            );
        } else {
            // absence of the manifest file means all tests should pass
            fs.rmSync(manifestFilename, { force: true });
        }
    }
}

process.on("beforeExit", () => {
    // log some additional diagnostics. not attempting to match `node:test`'s output since it varies by reporter
    console.log(`Expected failures: ${numExpectedFailures}`);
    console.log(`Expected timeouts: ${numExpectedTimeouts}`);
    console.log(`Unstable tests: ${numUnstableTests}`);
    console.log(`Passed tests: ${numPassedTests}`);
});
