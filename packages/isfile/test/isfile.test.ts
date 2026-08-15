import test from "node:test";
import assert from "node:assert";
import isFile from "@/index";

test("file package.json exists", async () => {
    const res = await isFile("package.json");
    assert.equal(res, true);
});

test("file /bin/ls exists", async () => {
    const res = await isFile("/bin/ls");
    assert.equal(res, true);
});

test("dir: . is not a file", async () => {
    const res = await isFile(".");
    assert.equal(res, false);
});

test("dir: .. is not a file", async () => {
    const res = await isFile("..");
    assert.equal(res, false);
});

test("dir: / is not a file", async () => {
    const res = await isFile("/");
    assert.equal(res, false);
});

test("file no-such-file does not exist", async () => {
    const res = await isFile("no-such-file");
    assert.equal(res, false);
});
