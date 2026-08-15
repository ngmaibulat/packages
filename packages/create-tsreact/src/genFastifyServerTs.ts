import type { Opts } from "./cli.js";

//CORS is registered for the vite origin even though dev traffic is proxied
//(see the proxy in genViteConfig.ts, which means the browser sees same-origin
//requests). It is here for the case the proxy is not: a built client served
//from somewhere else, or a fetch from the browser console while debugging.
//
//host is 127.0.0.1 rather than the default: binding 0.0.0.0 would put a dev
//API on every interface on the machine's network.
export default function genFastifyServerTs(o: Opts) {
    const tpl = `
import cors from "@fastify/cors";
import Fastify from "fastify";

const port = Number(process.env.PORT ?? 3001);

const app = Fastify({ logger: true });

await app.register(cors, { origin: "http://localhost:3000" });

app.get("/api/hello", async () => {
    return { message: "Hello World from ${o.name} api!" };
});

app.get("/api/health", async () => {
    return { status: "ok" };
});

try {
    await app.listen({ port, host: "127.0.0.1" });
} catch (err) {
    app.log.error(err);
    process.exit(1);
}
`;

    return tpl;
}
