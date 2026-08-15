import type { Opts } from "./cli.js";

//The tailwind plugin has to come after react() so that it sees the final css,
//and it replaces both @tailwindcss/cli and postcss - there is no
//postcss.config.* in this template and adding one would take tailwind off the
//fast path.
export default function genViteConfig(o: Opts) {
    //in the monorepo the api lives in a second process on another port, so
    //dev traffic is proxied rather than fetched cross-origin. Without this
    //the browser asks vite for /api/... and gets the SPA fallback html back,
    //which surfaces as a JSON parse error rather than as a missing route.
    const proxy =
        o.template === "fastify-react"
            ? `
    server: {
        port: 3000,
        proxy: {
            "/api": "http://localhost:3001",
        },
    },`
            : `
    server: {
        port: 3000,
    },`;

    const tpl = `
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react(), tailwindcss()],${proxy}
});
`;

    return tpl;
}
