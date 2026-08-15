import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import { BUNDLE_NAME, scalarBundle } from "./assets";
import { CliError } from "./errors";
import { indexHtml, scalarInitializer } from "./initializer";

export interface BuildOptions {
    /** Path to the OpenAPI/Swagger YAML (or JSON) document. */
    input: string;
    /** Directory to generate into. Created if missing. */
    outDir: string;
    /** Write into `outDir` even when it already exists. */
    force?: boolean;
    /** Load Scalar's default webfonts from fonts.scalar.com. */
    fonts?: boolean;
}

export interface BuildResult {
    outDir: string;
    /** Name of the converted spec inside `outDir`, e.g. `openapi.json`. */
    specFile: string;
    /** Title the page was given. */
    title: string;
    /** Everything written, relative to `outDir`. */
    written: string[];
}

/** The document's own title, falling back to the input filename. */
export function documentTitle(doc: unknown, input: string): string {
    const info = (doc as { info?: { title?: unknown } } | null)?.info;

    if (info && typeof info.title === "string" && info.title.trim()) {
        return info.title.trim();
    }

    return path.parse(input).name;
}

async function isFile(target: string): Promise<boolean> {
    try {
        return (await fs.stat(target)).isFile();
    } catch {
        return false;
    }
}

async function exists(target: string): Promise<boolean> {
    try {
        await fs.stat(target);
        return true;
    } catch {
        return false;
    }
}

/** Read a YAML document and return it as a plain object. */
export async function readDocument(input: string): Promise<unknown> {
    if (!(await isFile(input))) {
        throw new CliError(`input file ${input} does not exist`);
    }

    const text = await fs.readFile(input, "utf8");

    try {
        return YAML.parse(text);
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new CliError(`could not parse ${input}: ${reason}`, 2);
    }
}

/**
 * Generate a self-contained Scalar API reference for `input` into `outDir`.
 *
 * Everything written lands inside `outDir`. The published 1.0.x versions
 * installed npm packages into the caller's working directory and left a
 * package.json behind; nothing outside `outDir` is touched here.
 */
export async function build(options: BuildOptions): Promise<BuildResult> {
    const { input, outDir, force = false, fonts = false } = options;

    const doc = await readDocument(input);

    // The original refused outright when the output directory existed. Keep
    // that as the default and let --force opt in, rather than removing a
    // directory the caller may have put something else in.
    if (!force && (await exists(outDir))) {
        throw new CliError(
            `directory ${outDir} already exists -- remove it or pass --force`
        );
    }

    await fs.mkdir(outDir, { recursive: true });

    const specFile = `${path.parse(input).name}.json`;
    const title = documentTitle(doc, input);
    const written: string[] = [];

    await fs.copyFile(scalarBundle(), path.join(outDir, BUNDLE_NAME));
    written.push(BUNDLE_NAME);

    await fs.writeFile(path.join(outDir, "index.html"), indexHtml(title));
    written.push("index.html");

    await fs.writeFile(
        path.join(outDir, "scalar-initializer.js"),
        scalarInitializer({ specFile, fonts })
    );
    written.push("scalar-initializer.js");

    await fs.writeFile(
        path.join(outDir, specFile),
        `${JSON.stringify(doc, null, 2)}\n`
    );
    written.push(specFile);

    return { outDir, specFile, title, written };
}
