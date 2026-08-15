#!/usr/bin/env -S node --no-warnings

import { Command } from "commander";

import { actionLs } from "./actions/ls.js";
import { actionHView } from "./actions/hview.js";
import { actionHSendDir } from "./actions/hsenddir.js";
import { actionSendDir } from "./actions/senddir.js";
import { actionPing } from "./actions/ping.js";
import { actionSend } from "./actions/send.js";

const program = new Command();

const name = "sendeml";
const description = "Send raw eml files to SMTP server specified via env vars or .env file";
const version = "0.0.5";

program.name(name).description(description).version(version);

program
    .command("ping")
    .description("Test SMTP server by sending a generated message")
    // .argument("<from>", "From Addr")
    // .argument("<to>", "To Addr")
    .requiredOption("-s, --sender <sender>", "sender address", "sender@example.com")
    .requiredOption("-r, --rcpt <rcpt>", "recipient address", "recipient@example.com")
    .option("--subject", "Subject", "Hallar nisek?")
    .option("--text", "Text", "Test Message")
    .option("--debug", "Show debug output for SMTP conversation")
    .action(actionPing);

program
    .command("send")
    .description("Send eml file")
    .requiredOption("-s, --sender <sender>", "sender address", "sender@example.com")
    .requiredOption("-r, --rcpt <rcpt>", "recipient address", "recipient@example.com")
    .requiredOption("-f, --file <file>", "eml file path")
    .option("--debug", "Show debug output for SMTP conversation")
    .action(actionSend);

program
    .command("senddir")
    .description("Send eml files from a dir")
    .requiredOption("-s, --sender <sender>", "sender address", "sender@example.com")
    .requiredOption("-r, --rcpt <rcpt>", "recipient address", "recipient@example.com")
    .requiredOption("-d, --dir <dir>", "directory with eml files")
    .requiredOption("-m, --moveDest <dir>", "directory where to move sent files")
    .option("--max <max>", "Send first <max> amount of emails")
    .action(actionSendDir);

program
    .command("hsenddir")
    .description("Send eml files from a Haraka Queue dir")
    .requiredOption("-d, --dir <dir>", "Haraka Queue dir")
    .requiredOption("-m, --moveDest <dir>", "directory where to move sent files")
    .option("--max <max>", "Send first <max> amount of emails")
    .option("--moveto <dir>", "Move sent files to <dir>")
    .action(actionHSendDir);

program
    .command("hview")
    .description("View file from Haraka Queue dir")
    .requiredOption("-f, --file <path>", "Haraka Queue item")
    .action(actionHView);

program
    .command("ls")
    .description("List eml files in a dir")
    .requiredOption("-d, --dir <dir>", "dir")
    .action(actionLs);

program.parse();
