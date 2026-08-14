import test from "node:test";
import assert from "node:assert/strict";

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { FSMonitor } from "@/fsmonitor";

/** Resolve once the predicate has seen a matching event, or reject on timeout. */
function waitFor<T>(
    register: (resolve: (value: T) => void) => void,
    ms = 10_000
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`no event within ${ms}ms`)),
            ms
        );

        register((value) => {
            clearTimeout(timer);
            resolve(value);
        });
    });
}

test("on rejects an unsupported event", () => {
    const monitor = new FSMonitor(".", [], false);

    assert.throws(
        // @ts-expect-error -- deliberately outside the union
        () => monitor.on("explode", () => {}),
        /Invalid event: explode/
    );
});

test("off removes a previously registered handler", () => {
    const monitor = new FSMonitor(".", [], false);

    monitor.on("add", () => {});
    monitor.off("add");

    // nothing observable to assert without watching; the contract is that this
    // is a no-op rather than a throw
    assert.doesNotThrow(() => monitor.off("add"));
});

test("add events fire and the extension filter is honoured", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "run-fsmon-"));
    const monitor = new FSMonitor(dir, [".ts"], false);

    const seen: string[] = [];
    const added = waitFor<string>((resolve) => {
        monitor.on("add", (file) => {
            seen.push(file);
            resolve(file);
        });
    });

    const watcher = monitor.watch();
    t.after(async () => {
        await watcher.close();
        await fs.rm(dir, { recursive: true, force: true });
    });

    // give chokidar a moment to finish its initial scan
    await new Promise((resolve) => setTimeout(resolve, 300));

    // the ignored file is written first: if the filter were broken it would
    // arrive before the watched one
    await fs.writeFile(path.join(dir, "ignored.txt"), "nope");
    await fs.writeFile(path.join(dir, "watched.ts"), "export {};");

    const file = await added;

    assert.equal(path.basename(file), "watched.ts");
    assert.ok(
        !seen.some((entry) => entry.endsWith(".txt")),
        `.txt must be filtered out, saw: ${seen.join(", ")}`
    );
});

test("change and unlink events fire", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "run-fsmon-"));
    const file = path.join(dir, "target.ts");
    await fs.writeFile(file, "initial");

    const monitor = new FSMonitor(dir, [".ts"], false);

    let onChange: (value: string) => void = () => {};
    let onUnlink: (value: string) => void = () => {};

    const changed = waitFor<string>((resolve) => (onChange = resolve));
    const unlinked = waitFor<string>((resolve) => (onUnlink = resolve));

    monitor.on("change", (changedPath) => onChange(changedPath));
    monitor.on("unlink", (removedPath) => onUnlink(removedPath));

    const watcher = monitor.watch();
    t.after(async () => {
        await watcher.close();
        await fs.rm(dir, { recursive: true, force: true });
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    await fs.writeFile(file, "updated");
    assert.equal(path.basename(await changed), "target.ts");

    await fs.rm(file);
    assert.equal(path.basename(await unlinked), "target.ts");
});

test("the all handler receives every event", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "run-fsmon-"));
    const monitor = new FSMonitor(dir, [], false);

    const event = waitFor<{ event: string; file: string }>((resolve) => {
        monitor.setAllHandler((name, file) => resolve({ event: name, file }));
    });

    const watcher = monitor.watch();
    t.after(async () => {
        await watcher.close();
        await fs.rm(dir, { recursive: true, force: true });
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    await fs.writeFile(path.join(dir, "anything.log"), "x");

    const received = await event;
    assert.equal(received.event, "add");
    assert.equal(path.basename(received.file), "anything.log");
});
