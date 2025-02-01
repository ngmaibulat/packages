export async function run(
    program: string,
    args: string[],
    clean: boolean = false,
    envfile: string = "",
) {
    const child_process = await import("node:child_process");
    const spawn = child_process.spawn;

    if (clean) {
        cleanVars();
    }

    const dotenv = await import("dotenv");
    if (envfile) {
        dotenv.config({ path: envfile });
    } else {
        dotenv.config();
    }

    const cmd = spawn(program, args, { stdio: "inherit" });
    return cmd;
}

export function cleanVars() {
    const keep = new Set(["PATH", "HOME", "SHELL"]);

    Object.keys(process.env).forEach((key) => {
        if (!keep.has(key)) delete process.env[key];
    });
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMultiple(
    program: string,
    args: string[],
    clean: boolean = false,
    envfile: string = "",
    runs: number = 1,
    pause: number = 0,
) {
    const result = [];

    for (let i = 0; i < runs; i++) {
        const cmd = await run(program, args, clean, envfile);
        result.push(cmd);
        console.log("\n\n");

        if (pause) {
            await sleep(pause * 1000);
        }
    }

    return result;
}

export async function runForever(
    program: string,
    args: string[],
    clean: boolean = false,
    envfile: string = "",
    pause: number = 0,
) {
    while (true) {
        const cmd = await run(program, args, clean, envfile);
        console.log("\n\n");

        if (pause) {
            await sleep(pause * 1000);
        }
    }
}
