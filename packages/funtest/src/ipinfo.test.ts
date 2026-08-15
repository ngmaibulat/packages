import { test } from "node:test";
import assert from "node:assert/strict";
import { api, stdChecks, checkProps } from "./utils.ts";
import samples from "./sample/ipinfo.ts";

const url = "https://ipinfo.io";
const req = api(url);

test(`connect ${url}`, async () => {
    const reply = await req.get("/");
    assert.equal(reply.status, 200);
});

test("get /8.8.8.8", async () => {
    // ipinfo content-negotiates: without an explicit Accept it serves HTML.
    // api() sends "Accept: application/json" on every request, so this just works.
    const reply = await req.get("/8.8.8.8");

    stdChecks(reply);
    checkProps(reply.body, Object.keys(samples.reply));
});
