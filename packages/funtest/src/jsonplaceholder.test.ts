import { test } from "node:test";
import assert from "node:assert/strict";
import { api, stdChecks, checkArray, checkProps } from "./utils.ts";
import samples from "./sample/jsonplaceholder.ts";

const url = "https://jsonplaceholder.typicode.com";
const req = api(url);

test(`connect ${url}`, async () => {
    const reply = await req.get("/");
    assert.equal(reply.status, 200);
});

test("get /users", async () => {
    const reply = await req.get("/users");

    stdChecks(reply);
    checkArray(reply.body);
    checkProps(reply.body, Object.keys(samples.user));
});

test("get /posts", async () => {
    const reply = await req.get("/posts");

    stdChecks(reply);
    checkArray(reply.body);
    checkProps(reply.body, Object.keys(samples.post));
});

test("get /comments", async () => {
    const reply = await req.get("/comments");

    stdChecks(reply);
    checkArray(reply.body);
    checkProps(reply.body, Object.keys(samples.comment));
});
