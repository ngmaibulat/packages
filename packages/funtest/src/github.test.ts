import { test } from "node:test";
import assert from "node:assert/strict";
import { api, stdChecks, checkProps } from "./utils.ts";
import samples from "./sample/github.ts";

const url = "https://api.github.com";
const req = api(url);

function getUser(user: string) {
    return req.get(`/users/${user}`, {
        headers: { Accept: "application/vnd.github+json" },
    });
}

test(`connect ${url}`, async () => {
    const reply = await req.get("/");
    assert.equal(reply.status, 200);
});

test("get /users/octocat", async () => {
    const reply = await getUser("octocat");

    stdChecks(reply);
    checkProps(reply.body, Object.keys(samples.user));
});
