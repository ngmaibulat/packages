#!/usr/bin/env node

import { Command } from "commander";
import packageJson from "$/package.json" with { type: "json" };

import { build, readDocument } from "./build";
import { clean } from "./clean";
import { clone, REPOS } from "./clone";
import { CliError } from "./errors";
import { serve } from "./serve";
import { getInterfaces, type OpenApiDocument } from "./types";

const program = new Command();

program
    .name("mk-swagger-ui")
    .description("Static API reference generator (Scalar UI) from OpenAPI YAML")
    .version(packageJson.version);

program
    .command("build", { isDefault: true })
    .description("generate a static Scalar API reference from an OpenAPI document")
    .argument("<file>", "OpenAPI/Swagger YAML document")
    .option("-o, --out <dir>", "output directory", "dist")
    .option("-f, --force", "write into the output directory even if it exists")
    .option("-s, --serve [port]", "serve the bundle after building (port 3000)")
    .option("--fonts", "load Scalar's webfonts from fonts.scalar.com")
    .action(async (file: string, options) => {
        const result = await build({
            input: file,
            outDir: options.out,
            force: Boolean(options.force),
            fonts: Boolean(options.fonts),
        });

        console.log(`Generated ${result.written.length} files in ${result.outDir}`);
        console.log(`Title: ${result.title}`);
        console.log(`Spec: ${result.specFile}`);

        if (options.serve !== undefined) {
            const port =
                typeof options.serve === "string"
                    ? Number(options.serve)
                    : 3000;

            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                throw new CliError(`invalid port ${options.serve}`);
            }

            serve({ root: result.outDir, port });
        }
    });

program
    .command("types")
    .description("print TypeScript interfaces for components.schemas")
    .argument("<file>", "OpenAPI/Swagger YAML document")
    .action(async (file: string) => {
        const doc = (await readDocument(file)) as OpenApiDocument;
        const code = getInterfaces(doc);

        if (!code) {
            throw new CliError(`${file} declares no components.schemas`);
        }

        process.stdout.write(code);
    });

program
    .command("get")
    .description("git clone an upstream project into the current directory")
    .argument(`<${Object.keys(REPOS).join("|")}>`, "which project to clone")
    .action((target: string) => {
        clone(target);
    });

program
    .command("clean")
    .description("remove the directories `get` clones")
    .action(async () => {
        const removed = await clean();

        if (removed.length === 0) {
            console.log("Nothing to remove");
            return;
        }

        console.log(`Removed: ${removed.join(", ")}`);
    });

try {
    await program.parseAsync();
} catch (err) {
    if (err instanceof CliError) {
        console.error(`Error: ${err.message}`);
        process.exit(err.code);
    }

    throw err;
}
