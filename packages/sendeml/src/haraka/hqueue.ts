// Haraka Queueu Utils

import fs from "node:fs";
import path from "node:path";

import type { HQueueFile, QueueElement, HarakaMailAddr } from "./htypes.js";
import { tstampToDate, getTimeDiffSeconds, getTimeDiffHours } from "../utils/time.js";

export function parseFilename(filename: string): QueueElement {
    if (!filename) {
        throw new Error("No filename provided");
    }

    const basename = path.basename(filename);
    const p = basename.split("_");
    const timeArrival = parseInt(p[0]);
    const timeNext = parseInt(p[1]);

    const res: QueueElement = {
        dtArrival: tstampToDate(timeArrival),
        dtNextAttempt: tstampToDate(timeNext),
        attempts: +p[2],
        pid: +p[3],
        uniq: p[4],
        counter: +p[5],
        host: p[6],
        ageSeconds: getTimeDiffSeconds(timeArrival),
        ageHours: getTimeDiffHours(timeArrival),
    };

    return res;
}

function readLen(buff: Buffer): number {
    const len = buff.readUInt32BE();
    return len;
}

function readJson(buff: Buffer, len: number): HQueueFile {
    const newbuff = buff.subarray(4, len + 4);
    const strVal = newbuff.toString();
    const obj = JSON.parse(strVal);
    return obj as HQueueFile;
}

function readEml(buff: Buffer, len: number): string {
    const newbuff = buff.subarray(len + 4);
    const strVal = newbuff.toString();
    return strVal;
}

function getAddr(addr: HarakaMailAddr): string {
    return addr.user + "@" + addr.host;
}

function getAddrList(addrs: HarakaMailAddr[]): string[] {
    const res: string[] = [];

    for (const item of addrs) {
        res.push(getAddr(item));
    }

    return res;
}

export function readHQueueFile(file: string): HQueueFile {
    const data = fs.readFileSync(file);
    const ln = readLen(data);
    const obj = readJson(data, ln);

    obj.sender = getAddr(obj.mail_from);
    obj.recipients = getAddrList(obj.rcpt_to);

    obj.eml = readEml(data, ln);

    obj.dtQueue = new Date();
    obj.dtQueue.setTime(obj.queue_time);

    obj.filename = file;
    obj.fileinfo = parseFilename(file);

    return obj as HQueueFile;
}
