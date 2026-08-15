import { CliError } from "./error.js";

//A scanner for Bruno's .bru markup. The format is three block shapes, all
//delimited:
//
//    meta {                 dict  - "key: value" lines, "~key" means disabled
//      name: List users
//    }
//    vars:secret [          list  - one bare item per line
//      apiKey
//    ]
//    body:json {            text  - raw content, handed back untouched
//      { "hello": "world" }
//    }
//
//Blocks are found by depth-counting the delimiter, which is safe for dict and
//list blocks because the only braces that appear in them are {{var}} pairs,
//and those are balanced. Text blocks can hold arbitrary JSON or JavaScript,
//so there the scanner also skips over "..." strings and ''' fences.
//
//Known limitation: a lone apostrophe is *not* treated as a string delimiter
//in a text block. Unbalanced braces inside a single-quoted JS string would
//confuse the scanner, but apostrophes inside JSON values are far more common
//than that, and mis-parsing those would be the worse failure.

export type BlockKind = "dict" | "list" | "text";

export type Block = {
    name: string;
    kind: BlockKind;
    content: string;
};

export type Entry = {
    key: string;
    value: string;
    enabled: boolean;
};

//contents are opaque to us: we only need to find where they end. Everything
//else is a dict, or a list when it opens with [ instead of {.
function isTextBlock(name: string) {
    return (
        name.startsWith("body") || name.startsWith("script") || name === "tests" || name === "docs"
    );
}

//block names carry ":" and "-": body:json, script:pre-request, vars:secret
function isNameChar(ch: string) {
    return /[\w:.-]/.test(ch);
}

//returns the index just past the closing delimiter, having started one
//character past the opening one
function findEnd(src: string, from: number, open: string, isText: boolean) {
    const close = open === "{" ? "}" : "]";
    let depth = 1;
    let i = from;

    while (i < src.length) {
        const ch = src[i];

        if (isText && src.startsWith("'''", i)) {
            const end = src.indexOf("'''", i + 3);
            i = end === -1 ? src.length : end + 3;
            continue;
        }

        if (isText && ch === '"') {
            i++;
            while (i < src.length && src[i] !== '"') {
                i += src[i] === "\\" ? 2 : 1;
            }
            i++;
            continue;
        }

        if (ch === open) {
            depth++;
        } else if (ch === close) {
            depth--;
            if (depth === 0) {
                return i;
            }
        }

        i++;
    }

    return -1;
}

//a .bru file is a flat sequence of blocks. Duplicates are last-wins rather
//than an error - it is not our job to lint someone's collection.
export function parseBru(src: string, file: string): Map<string, Block> {
    const blocks = new Map<string, Block>();
    let i = 0;

    while (i < src.length) {
        //skip whitespace and # comment lines between blocks
        while (i < src.length && /\s/.test(src[i])) {
            i++;
        }
        if (src[i] === "#") {
            const nl = src.indexOf("\n", i);
            i = nl === -1 ? src.length : nl + 1;
            continue;
        }
        if (i >= src.length) {
            break;
        }

        const start = i;
        while (i < src.length && isNameChar(src[i])) {
            i++;
        }
        const name = src.slice(start, i);

        while (i < src.length && /[ \t]/.test(src[i])) {
            i++;
        }

        const open = src[i];
        if (!name || (open !== "{" && open !== "[")) {
            throw new CliError(`Could not parse ${file}: expected a block at character ${start}`);
        }

        const isText = open === "{" && isTextBlock(name);
        const end = findEnd(src, i + 1, open, isText);

        if (end === -1) {
            throw new CliError(`Could not parse ${file}: block "${name}" is never closed`);
        }

        const kind: BlockKind = open === "[" ? "list" : isText ? "text" : "dict";

        blocks.set(name, { name, kind, content: src.slice(i + 1, end) });
        i = end + 1;
    }

    return blocks;
}

//"key: value" per line. A value of ''' opens a fence that runs to the next
//line holding only ''', which is how Bruno writes multiline values.
export function entries(block: Block | undefined): Entry[] {
    if (!block) {
        return [];
    }

    const lines = block.content.split("\n");
    const out: Entry[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!line || line.startsWith("#")) {
            continue;
        }

        const colon = line.indexOf(":");
        if (colon === -1) {
            continue;
        }

        const raw = line.slice(0, colon).trim();
        const enabled = !raw.startsWith("~");
        const key = enabled ? raw : raw.slice(1).trim();
        let value = line.slice(colon + 1).trim();

        if (value === "'''") {
            const body: string[] = [];
            i++;
            while (i < lines.length && lines[i].trim() !== "'''") {
                body.push(lines[i]);
                i++;
            }
            value = dedent(body).join("\n");
        }

        out.push({ key, value, enabled });
    }

    return out;
}

//enabled entries only, as a plain object - what almost every caller wants
export function dict(block: Block | undefined): Record<string, string> {
    const out: Record<string, string> = {};

    for (const e of entries(block)) {
        if (e.enabled) {
            out[e.key] = e.value;
        }
    }

    return out;
}

//one bare item per line: vars:secret [ apiKey ]
export function list(block: Block | undefined): string[] {
    if (!block) {
        return [];
    }

    return block.content
        .split("\n")
        .map((l) => l.trim().replace(/,$/, ""))
        .filter((l) => l && !l.startsWith("#"));
}

//strip the common leading indentation so a fenced value or a body:json block
//does not inherit the indentation of the block that contained it
export function dedent(lines: string[]) {
    const width = lines
        .filter((l) => l.trim())
        .reduce((min, l) => Math.min(min, l.length - l.trimStart().length), Infinity);

    if (!Number.isFinite(width) || width === 0) {
        return lines;
    }

    return lines.map((l) => (l.trim() ? l.slice(width) : l));
}

//text blocks arrive with the surrounding newlines and indentation still on
export function text(block: Block | undefined) {
    if (!block) {
        return undefined;
    }

    const lines = block.content.split("\n");

    while (lines.length && !lines[0].trim()) {
        lines.shift();
    }
    while (lines.length && !lines[lines.length - 1].trim()) {
        lines.pop();
    }

    return lines.length ? dedent(lines).join("\n") : undefined;
}
