import { Writable } from 'node:stream';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';

export async function hashMD5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const file = createReadStream(filePath);
        const hash = createHash('md5');
        file.on('data', (data) => {
            hash.update(data);
        });
        file.on('end', () => {
            const md5Hash = hash.digest('hex');
            resolve(md5Hash);
        });
        file.on('error', (err) => {
            reject(err);
        });
    });
}

export async function hashSHA256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const file = createReadStream(filePath);
        const hash = createHash('sha256');
        file.on('data', (data) => {
            hash.update(data);
        });
        file.on('end', () => {
            const md5Hash = hash.digest('hex');
            resolve(md5Hash);
        });
        file.on('error', (err) => {
            reject(err);
        });
    });
}
