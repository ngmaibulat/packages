//Which package manager launched us.
//
//npm, pnpm, yarn and bun all set npm_config_user_agent when they run a
//script or a "create" command, in the form "pnpm/11.6.0 npm/? node/v26.3.0".
//Reading it is the only way to tell "npm create tsreact" from "pnpm create
//tsreact" - process.argv looks identical either way.
//
//This exists so the further-steps block tells you to run the commands for the
//tool you actually used. Printing "pnpm install" to someone who typed
//"npm create" is a small thing that costs them a real minute.
//
//The default is pnpm rather than npm: that is what the generated workspaces
//are built around, and an unset user agent means nobody launched us through a
//package manager at all (a direct "node bin/index.js", which is also how
//smoke.mjs runs - so its output stays deterministic).
export type Pm = {
    name: string;
    //"pnpm install"
    install: string;
    //pnpm and bun take a bare script name; npm and yarn need "run" for
    //anything that is not a built-in
    run: (script: string) => string;
    //one-off execution of a published binary
    dlx: string;
};

const PMS: Record<string, Pm> = {
    pnpm: {
        name: "pnpm",
        install: "pnpm install",
        run: (s) => `pnpm ${s}`,
        dlx: "pnpm dlx",
    },
    npm: {
        name: "npm",
        install: "npm install",
        run: (s) => `npm run ${s}`,
        dlx: "npx",
    },
    yarn: {
        name: "yarn",
        install: "yarn install",
        run: (s) => `yarn ${s}`,
        dlx: "yarn dlx",
    },
    bun: {
        name: "bun",
        install: "bun install",
        run: (s) => `bun run ${s}`,
        dlx: "bunx",
    },
};

export function detectPm(agent = process.env.npm_config_user_agent): Pm {
    const name = agent?.split("/")[0] ?? "";

    return PMS[name] ?? PMS.pnpm;
}
