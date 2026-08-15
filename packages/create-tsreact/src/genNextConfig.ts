//Deliberately empty apart from the type annotation.
//
//NOTE: do not add a "webpack" key here. Next 16 builds with Turbopack by
//default, and it refuses to start rather than silently ignoring a webpack
//config it cannot honour - so a webpack entry turns "next build" into a hard
//failure. Turbopack's own escape hatch is the "turbopack" key.
export default function genNextConfig() {
    const tpl = `
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
`;

    return tpl;
}
