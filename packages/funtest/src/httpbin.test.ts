import { test } from "node:test";
import assert from "node:assert/strict";
import { api, stdChecks, checkProps } from "./utils.ts";

// httpbingo.org is the maintained Go reimplementation of httpbin.org,
// which now returns 503 on every endpoint.
const url = "https://httpbingo.org";
const req = api(url);

test(`connect ${url}`, async () => {
    const reply = await req.get("/");
    assert.equal(reply.status, 200);
});

const endpoints: Array<[path: string, prop: string]> = [
    ["/uuid", "uuid"],
    ["/headers", "headers"],
    ["/ip", "origin"],
    ["/user-agent", "user-agent"],
];

for (const [path, prop] of endpoints) {
    test(`get ${path}`, async () => {
        const reply = await req.get(path);

        stdChecks(reply);
        checkProps(reply.body, [prop]);
    });
}
