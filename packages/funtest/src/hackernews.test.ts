import { test } from "node:test";
import assert from "node:assert/strict";
import { api, stdChecks, checkArray } from "./utils.ts";

const url = "https://hacker-news.firebaseio.com";
const req = api(url);

test(`connect ${url}`, async () => {
    // the root redirects, so don't follow it — the 301 is the thing being asserted
    const reply = await req.get("/", { redirect: "manual" });
    assert.equal(reply.status, 301);
});

for (const path of ["/v0/topstories.json", "/v0/newstories.json", "/v0/beststories.json"]) {
    test(`get ${path}`, async () => {
        const reply = await req.get(path);

        stdChecks(reply);
        checkArray(reply.body);
    });
}
