import test from "node:test";
import assert from "node:assert/strict";

import os from "node:os";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { WebLog } from "@/logging/weblog";

type Received = {
    url: string;
    headers: http.IncomingHttpHeaders;
    body: string;
};

/** Start a throwaway HTTP server that records every request it receives. */
async function recordingServer() {
    const received: Received[] = [];

    const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            received.push({ url: req.url ?? "", headers: req.headers, body });
            res.writeHead(200).end("ok");
        });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    return {
        received,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}

/** A port nothing is listening on, so fetch fails fast. */
async function deadURL() {
    const server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    return `http://127.0.0.1:${port}`;
}

test("insertLog POSTs the run metadata to /api/log", async (t) => {
    const server = await recordingServer();
    t.after(() => server.close());

    const weblog = new WebLog(server.url);
    await weblog.insertLog("/work", "ls", ["-l"], "/work/.env", 0, "uuid-1");

    assert.equal(server.received.length, 1);

    const request = server.received[0];
    assert.equal(request.url, "/api/log");
    assert.match(String(request.headers["content-type"]), /application\/json/);

    const body = JSON.parse(request.body);
    assert.equal(body.cwd, "/work");
    assert.equal(body.cmd, "ls");
    assert.deepEqual(JSON.parse(body.args), ["-l"], "args are sent JSON encoded");
    assert.equal(body.env, "/work/.env");
    assert.equal(body.rc, 0);
    assert.equal(body.uuid, "uuid-1");
    assert.equal(body.username, os.userInfo().username);
    assert.equal(body.userid, os.userInfo().uid);
});

test("insertOutput POSTs raw output to /api/output keyed by uuid", async (t) => {
    const server = await recordingServer();
    t.after(() => server.close());

    const weblog = new WebLog(server.url);
    await weblog.insertOutput("uuid-2", "hello\r\nworld");

    assert.equal(server.received.length, 1);

    const request = server.received[0];
    assert.equal(request.url, "/api/output");
    assert.equal(request.headers.uuid, "uuid-2");
    assert.match(String(request.headers["content-type"]), /text\/plain/);
    assert.equal(request.body, "hello\r\nworld", "output is sent verbatim");
});

test("a transport failure is swallowed, never thrown", async (t) => {
    const url = await deadURL();

    // the implementation reports the failure on stderr; keep the test output clean
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    t.after(() => {
        console.error = original;
    });

    const weblog = new WebLog(url);

    await assert.doesNotReject(() => weblog.insertLog(".", "ls", [], "", 0, "u"));
    await assert.doesNotReject(() => weblog.insertOutput("u", "out"));

    assert.equal(errors.length, 2, "both failures are reported");
});
