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
