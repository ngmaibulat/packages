import fs from "node:fs/promises";
import isFile from "@aibulat/isfile";

export async function readJson<T>(path: string): Promise<T> {
    const fileExists = await isFile(path);

    if (!fileExists) {
        throw new Error(`file ${path} does not exist`);
    }

    const rawdata = await fs.readFile(path);
    const data = JSON.parse(rawdata.toString());
    return data as T;
}
