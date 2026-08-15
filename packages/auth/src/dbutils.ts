import bcrypt from "bcryptjs";

import { db } from "./db.js";
import { dbinfo } from "./db.js";
import { schemaCreated } from "./schema.js";

import { User } from "./types.js";

async function rping() {
    try {
        await db.raw("SELECT 1");
        return [true, null];
    } catch (e) {
        return [false, e];
    }
}

export async function ping() {
    console.log("Testing db connection...");
    const [res, error] = await rping();

    if (res) {
        console.log("OK");
    }
    //Error
    else {
        const err = error as Error;
        console.error("Cannot access the database");
        console.error(err.message);
    }
}

export function info() {
    console.log("");
    console.log(dbinfo);
}

async function preCheck() {
    //ping
    const [res, error] = await rping();

    if (!res) {
        console.log("Cannot access database");
        return false;
    }

    //check schema
    const schema = await schemaCreated();

    if (!schema) {
        console.error("schema has not been created");
        console.log("run: auth init");
        return false;
    }

    return true;
}

export async function list() {
    if (!preCheck()) {
        return;
    }

    const data = await db<User>("users").select("email", "created_at");

    if (!data.length) {
        console.log("No records found");
    } else {
        // console.log(data);
        for (const item of data) {
            console.log(item);
        }
    }
}

export async function add(user: string, pass: string) {
    if (!preCheck()) {
        return;
    }

    if (!user) {
        console.log("Usage: add <user> <pass>");
        return;
    }

    if (!pass) {
        console.log("Usage: add <user> <pass>");
        return;
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(pass, salt);

    try {
        await db<User>("users").insert({
            email: user,
            hash: hash,
        });

        console.log("OK");
    } catch (err) {
        console.error("Creation failed");
    }
}

export async function chpw(user: string, pass: string) {
    if (!preCheck()) {
        return;
    }

    if (!user) {
        console.log("Usage: chpass <user> <pass>");
        return;
    }

    if (!pass) {
        console.log("Usage: chpass <user> <pass>");
        return;
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(pass, salt);

    try {
        const data = await db<User>("users").where({
            email: user,
        });

        if (!data.length) {
            console.error("User not found");
            return;
        }

        const record = data[0];
        record.hash = hash;

        const res = await db<User>("users")
            .where({
                email: user,
            })
            .update(record);

        console.log("OK");
    } catch (err) {
        console.error("Change Password failed");
    }
}

export async function del(user: string) {
    if (!preCheck()) {
        return;
    }

    if (!user) {
        console.log("Usage: add <user> <pass>");
        return;
    }

    try {
        const res = await db<User>("users").where({ email: user }).del();
        if (!res) {
            console.log("Record not found");
        } else {
            console.log("OK");
        }
    } catch (err) {
        console.error("Delete failed");
    }
}

export async function checkpw(user: string, pass: string) {
    if (!preCheck()) {
        return;
    }

    if (!user) {
        console.log("Usage: check <user> <pass>");
        return;
    }

    if (!pass) {
        console.log("Usage: check <user> <pass>");
        return;
    }

    try {
        const data = await db<User>("users").where({ email: user }).select("email", "hash", "created_at");

        if (!data.length) {
            console.log("No records found");
            return;
        }

        const record = data[0];
        const res = bcrypt.compareSync(pass, record.hash);

        if (res) {
            console.log("Success: Correct username/password!");
        } else {
            console.log("Fail: Username/password IS NOT correct");
        }
    } catch (err) {
        console.error("Check failed");
    }
}
