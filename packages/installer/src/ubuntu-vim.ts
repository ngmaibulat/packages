#!/usr/bin/env -S node --no-warnings

// The published bin runs under plain node, so zx's globals ($, chalk, echo,
// os, ...) have to be imported rather than supplied by the interpreter.
import "zx/globals";

import { isRoot } from "./utils";

const root = isRoot();

if (!root) {
    console.error(chalk.red("This program must be run as root!"));
    process.exit(1);
}

await $`apt install -qq vim`;
echo(``);
