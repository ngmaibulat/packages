import { runSpawn, runVT } from "./librun";

export async function run(
    cmd: string,
    args: string[],
    clean = false,
    envfile = ""
) {
    if (clean) {
        cleanVars();
    }

    const dotenv = await import("dotenv");
    if (envfile) {
        dotenv.config({ path: envfile });
    } else {
        dotenv.config();
    }

    return await runVT(cmd, args);
}

export function cleanVars() {
    const keep = new Set(["PATH", "HOME", "SHELL"]);
    const envKeys = Object.keys(process.env);

    for (const key of envKeys) {
        const allowed = keep.has(key);

        if (!allowed) {
            delete process.env[key];
        }
    }
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMultiple(
    program: string,
    args: string[],
    clean = false,
    envfile = "",
    runs = 1,
    pause = 0
) {
    const result = [];

    for (let i = 0; i < runs; i++) {
        const cmd = await run(program, args, clean, envfile);
        result.push(cmd);
        console.log("\n");

        if (pause) {
            await sleep(pause * 1000);
        }
    }

    return result;
}

export async function runForever(
    program: string,
    args: string[],
    clean = false,
    envfile = "",
    pause = 0
) {
    while (true) {
        const cmd = await run(program, args, clean, envfile);
        console.log("\n");

        if (pause) {
            await sleep(pause * 1000);
        }
    }
}
