#!/usr/bin/env -S node --no-warnings

import bcrypt from "bcryptjs";

if (process.argv.length < 4) {
    const samplePass = "P@ssw0rd";
    const sampleHash = "$2a$10$07okrFScBYiAXXpaMLyq/uvExcWXOw4B.rxaY0MtOWl6Rtl1IPsbW";
    console.log(`example: bcrypt-compare '${samplePass}' '${sampleHash}' `);
    process.exit(1);
}

const clear = process.argv[2];
const hash = process.argv[3];

const result = await bcrypt.compare(clear, hash);

if (result) {
    console.log("Hash match!");
} else {
    console.log("Hash did not match!");
}
