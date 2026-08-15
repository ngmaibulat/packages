import test from "node:test";
import assert from "node:assert/strict";

import { BUNDLE_NAME } from "@/assets";
import { escapeHtml, indexHtml, scalarInitializer } from "@/initializer";

test("scalarInitializer points Scalar at the generated spec", () => {
    const code = scalarInitializer({ specFile: "openapi.json" });

    assert.match(code, /Scalar\.createApiReference\("#app"/);
    assert.match(code, /url: "openapi\.json"/);
});

test("scalarInitializer disables the hosted webfonts by default", () => {
    const code = scalarInitializer({ specFile: "openapi.json" });

    assert.match(code, /withDefaultFonts: false/);
});

test("scalarInitializer opts back into the hosted webfonts", () => {
    const code = scalarInitializer({ specFile: "openapi.json", fonts: true });

    assert.match(code, /withDefaultFonts: true/);
});

test("scalarInitializer configures no request proxy", () => {
    const code = scalarInitializer({ specFile: "openapi.json" });

    assert.doesNotMatch(code, /proxyUrl/);
    assert.doesNotMatch(code, /scalar\.com/);
});

test("scalarInitializer quotes a spec name containing awkward characters", () => {
    const code = scalarInitializer({ specFile: 'we"ird.json' });

    // JSON.stringify, not naive interpolation -- otherwise the quote closes the
    // string and the generated file is a syntax error.
    assert.match(code, /url: "we\\"ird\.json"/);
});

test("indexHtml loads the bundle and the initializer, in that order", () => {
    const html = indexHtml("Pet Store");

    const bundle = html.indexOf(`./${BUNDLE_NAME}`);
    const init = html.indexOf("./scalar-initializer.js");

    assert.ok(bundle > -1, "the bundle is not referenced");
    assert.ok(init > -1, "the initializer is not referenced");
    assert.ok(bundle < init, "Scalar must be defined before it is called");
});

test("indexHtml provides the mount point the initializer targets", () => {
    assert.match(indexHtml("Pet Store"), /<div id="app">/);
});

test("indexHtml references nothing off-host", () => {
    const html = indexHtml("Pet Store");

    assert.doesNotMatch(html, /https?:\/\//);
});

test("indexHtml uses the document title", () => {
    assert.match(indexHtml("Pet Store"), /<title>Pet Store<\/title>/);
});

test("indexHtml escapes the title", () => {
    const html = indexHtml('Pets & <script>alert("x")</script>');

    assert.match(html, /<title>Pets &amp; &lt;script&gt;/);
    assert.doesNotMatch(html, /<script>alert/);
});

test("escapeHtml covers the delimiters", () => {
    assert.equal(escapeHtml('<a href="x">&</a>'), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
});
