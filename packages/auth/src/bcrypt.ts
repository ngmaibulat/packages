#!/usr/bin/env -S node --no-warnings

import bcrypt from "bcryptjs";

if (process.argv.length < 3) {
    console.log("example: bcrypt 'someSecurePassword%^&'");
    process.exit(1);
}

const input = process.argv[2];

const salt = await bcrypt.genSalt(10);

const hash = await bcrypt.hash(input, salt);

console.log(hash);
