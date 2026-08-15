import { test } from "node:test";
import assert from "node:assert/strict";
import { api, stdChecks, checkArray, checkProps } from "./utils.ts";
import samples from "./sample/ramdonuser.ts";

const url = "https://randomuser.me";
const req = api(url);

test(`connect ${url}`, async () => {
    const reply = await req.get("/");
    assert.equal(reply.status, 200);
});

test("get /api", async () => {
    const reply = await req.get("/api");

    stdChecks(reply);
    checkArray(reply.body.results);
    checkProps(reply.body.results[0], Object.keys(samples.reply.results[0]));
});
