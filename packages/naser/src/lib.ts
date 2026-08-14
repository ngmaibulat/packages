import fs from "node:fs/promises";
import Anser from "anser";

/** Convert a string containing ANSI escape sequences into HTML. */
export function convert(content: string): string {
    return Anser.ansiToHtml(content);
}

/** Read a file and convert its ANSI content into HTML. */
export async function convertFile(path: string): Promise<string> {
    const content = await fs.readFile(path, { encoding: "utf-8" });
    return convert(content);
}
