import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
    APPS,
    CliError,
    DESCRIPTIONS,
    TEMPLATES,
    VERSION,
    parseArgs,
    validateName,
} from "@/cli.js";

describe("parseArgs", () => {
    it("returns usage with no arguments", () => {
        assert.equal(parseArgs([]).kind, "usage");
    });

    it("recognises --help and -h ahead of everything else", () => {
        assert.equal(parseArgs(["--help"]).kind, "help");
        assert.equal(parseArgs(["-h"]).kind, "help");
        assert.equal(parseArgs(["app", "--help"]).kind, "help");
    });

    it("recognises --version and -v", () => {
        assert.equal(parseArgs(["--version"]).kind, "version");
        assert.equal(parseArgs(["-v"]).kind, "version");
    });

    it("defaults to the react template", () => {
        const parsed = parseArgs(["myapp"]);
        assert.equal(parsed.kind, "create");
        assert.equal(parsed.opts.template, "react");
        assert.equal(parsed.opts.name, "myapp");
    });

    it("accepts a template as --template, -t and --template=", () => {
        for (const argv of [
            ["myapp", "--template", "pwa"],
            ["myapp", "-t", "pwa"],
            ["myapp", "--template=pwa"],
        ]) {
            const parsed = parseArgs(argv);
            assert.equal(parsed.kind, "create");
            assert.equal(parsed.opts.template, "pwa");
        }
    });

    it("rejects an unknown template", () => {
        assert.throws(() => parseArgs(["myapp", "-t", "nope"]), CliError);
    });

    it("treats --daisyui as implying --tailwind", () => {
        const parsed = parseArgs(["myapp", "--daisyui"]);
        assert.equal(parsed.kind, "create");
        assert.equal(parsed.opts.daisyui, true);
        assert.equal(parsed.opts.tailwind, true);
    });

    // --list-templates cannot return on sight: --json may still be ahead of it.
    it("picks up --json after --list-templates", () => {
        assert.deepEqual(parseArgs(["--list-templates"]), { kind: "templates", json: false });
        assert.deepEqual(parseArgs(["--list-templates", "--json"]), {
            kind: "templates",
            json: true,
        });
    });

    it("rejects an unknown option", () => {
        assert.throws(() => parseArgs(["myapp", "--nope"]), CliError);
    });
});

describe("validateName", () => {
    it("accepts an ordinary name", () => {
        assert.equal(validateName("my-app"), "my-app");
    });

    // The cases the check actually exists for: path escapes and unquotable names.
    it("rejects the names that would break a path or a shell word", () => {
        for (const bad of ["", "..", "a/b", "a\\b", ".hidden", "_private", 'say"what']) {
            assert.throws(() => validateName(bad), CliError, `expected ${bad} to be rejected`);
        }
    });
});

describe("template tables", () => {
    // TEMPLATES is the source of truth; the other two are keyed off it, so a
    // preset added to one and not the others fails here rather than at runtime.
    it("DESCRIPTIONS and APPS cover every template exactly", () => {
        assert.deepEqual(Object.keys(DESCRIPTIONS).sort(), [...TEMPLATES].sort());
        assert.deepEqual(Object.keys(APPS).sort(), [...TEMPLATES].sort());
    });

    it("every template has a non-empty description", () => {
        for (const t of TEMPLATES) assert.ok(DESCRIPTIONS[t].length > 0, t);
    });
});

describe("VERSION", () => {
    // The manifest is imported at build time rather than read from disk; a
    // regression there shows up as undefined, not as a thrown error.
    it("is the manifest's semver", () => {
        assert.match(VERSION, /^\d+\.\d+\.\d+/);
    });
});
