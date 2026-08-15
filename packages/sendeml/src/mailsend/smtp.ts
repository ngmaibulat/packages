import fs from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";
import nodemailer from "nodemailer";

import { simpleParser, ParsedMail } from "mailparser";
import type { smtpAuth, smtpOptions, pingOptions } from "../types.js";
import { isDir } from "../utils/dir.js";
import isFile from "@aibulat/isfile";

import { logger } from "../logger.js";

dotenv.config();

export function getSmtpPort(): number {
    if (process.env.SMTP_PORT) {
        const port = parseInt(process.env.SMTP_PORT);
        return port;
    } else {
        return 25;
    }
}

export function getSmtpOptions() {
    //type smtpOptions
    const options: smtpOptions = {
        host: process.env.SMTP_HOST || "localhost",
        port: getSmtpPort(),
        secure: false,
        connectionTimeout: 10000,
    };

    if (process.env.SMTP_USER) {
        const auth = {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS || "",
        };
        options.auth = auth;
    }

    return options;
}

export function getSmtpTransport() {
    const options = getSmtpOptions();
    const transport = nodemailer.createTransport(options);
    return transport;
}

export async function sendEml(eml: string, from: string, to: string[]) {
    return sendEmlEx(eml, from, to);
}

export async function sendEmlEx(eml: string, from: string, to: string[], filename: string = "") {
    const envelope = { from, to };
    const message = { envelope, raw: eml };
    const toStr = to.join(",");

    // send email

    try {
        const transport = getSmtpTransport();
        const res = await transport.sendMail(message);
        logger.info(res);
        return true;
    } catch (err: any) {
        //
        //ECONNREFUSED
        if (err.code == "ESOCKET") {
            logger.error(`SMTP connection error: ${err.address} ${err.port}`);
            return false;
        }

        // EENVELOPE
        else if (err.code == "EENVELOPE") {
            const command = err.command;
            const response = err.response;
            const responseCode = err.responseCode;

            const msg = `SMTP error: ${filename} ${from} ${toStr} ${command} ${responseCode} ${response}`;
            logger.error(msg);

            return false;
        }

        //Unexpected socket close
        else if (err.message == "Unexpected socket close") {
            //Unexpected socket close
            const msg = `SMTP error: ${err.message} ${filename} ${from} ${toStr}`;
            logger.error(msg);
            return false;
        }

        //Catch other hard bounces
        else if (err.responseCode && err.responseCode >= 500) {
            const command = err.command;
            const response = err.response;
            const responseCode = err.responseCode;

            const msg = `SMTP error/Hard Bounce: ${filename} ${from} ${toStr} ${command} ${responseCode} ${response}`;
            logger.error(msg);

            return false;
        }

        //Other errors
        else {
            console.log(JSON.parse(JSON.stringify(err)));
            console.log(err);
            return false;
        }
    }
}

export async function sendEmlFile(filename: string, from: string, to: string[]) {
    const buff = await fs.readFile(filename);
    const raw = buff.toString();
    return sendEmlEx(raw, from, to, filename);
}

export async function smtpPing(options: pingOptions) {
    const envelope = {
        from: options.sender,
        to: [options.rcpt],
    };
    const raw = `From: ${options.sender}
To: ${options.rcpt}
Subject: ${options.subject}

${options.text}
`;
    const message = { envelope, raw };

    // send email
    const transport = getSmtpTransport();
    const res = await transport.sendMail(message);
    return res;
}

export async function parseEml(filename: string): Promise<ParsedMail> {
    const emlContents = await fs.readFile(filename, "utf-8");
    const res = simpleParser(emlContents);
    return res;
}

export async function parseEmlDir(dirname: string) {
    if (!dirname) {
        throw new Error(`Invalid dirname argument`);
    }

    if (typeof dirname != "string") {
        throw new Error(`Invalid dirname argument`);
    }

    if (!isDir(dirname)) {
        throw new Error(`Directory does not exist: ${dirname}`);
    }

    const arr = [];
    const files = await fs.readdir(dirname);

    for (const file of files) {
        const realPath = path.resolve(dirname, file);
        const pathIsFile = await isFile(realPath);

        if (pathIsFile) {
            const data = await parseEml(realPath);
            if (data.from) {
                arr.push(data);
            }
        }
    }

    return arr;
}
