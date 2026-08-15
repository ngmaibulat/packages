import assert from "node:assert";
import test from "node:test";
import { isDir } from "../utils/dir.js";

try {
    await isDir("");
} catch (err: any) {
    console.log(errorToObject(err));
}

function errorToObject(err: Error) {
    const tmp = JSON.stringify(err, Object.getOwnPropertyNames(err));
    return JSON.parse(tmp);
}

async function asyncFail() {
    throw new Error("Division by zero");
}

assert.rejects(asyncFail, {
    name: "Error",
    message: "Division by zero",
});
