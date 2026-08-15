import fs from 'node:fs/promises';
import type { PathLike } from 'node:fs';

export async function readFile(src: PathLike) {
    const res = await fs.readFile(src);
    return res;
}

export async function readFileAsString(src: PathLike) {
    const res = await fs.readFile(src, 'utf8');
    return res;
}
