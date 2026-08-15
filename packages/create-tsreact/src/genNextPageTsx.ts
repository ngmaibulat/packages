import type { Opts } from "./cli.js";

//An async server component that actually queries the database, so that the
//drizzle half of the template is exercised by simply opening the page rather
//than only by "npm run db:studio".
//
//The try/catch is what makes the first run pleasant: before "npm run db:push"
//there is no users table, and an unhandled SQLITE_ERROR is a worse first
//impression than a line telling you which command to run.
export default function genNextPageTsx(o: Opts) {
    const card = o.daisyui
        ? `<main className="card mx-auto mt-8 max-w-lg bg-base-100 shadow">
            <div className="card-body">`
        : `<main className="mx-auto mt-8 max-w-lg rounded border border-slate-300 p-4">
            <div>`;

    const heading = o.daisyui
        ? `<h1 className="card-title">Hello World from ${o.name} app!</h1>`
        : `<h1 className="text-2xl font-bold">Hello World from ${o.name} app!</h1>`;

    const tpl = `
import { db } from "@/db";
import { usersTable } from "@/db/schema";

//not cached: the point of this page is to show what is in the database now
export const dynamic = "force-dynamic";

async function readUsers() {
    try {
        return { users: await db.select().from(usersTable), error: null };
    } catch {
        return { users: [], error: 'run "npm run db:push" to create the table' };
    }
}

export default async function Home() {
    const { users, error } = await readUsers();

    return (
        ${card}
                ${heading}
                <p className="mt-2 text-sm text-slate-500">
                    {error ?? \`\${users.length} user(s) in the database\`}
                </p>
                <ul className="mt-4 list-disc pl-5">
                    {users.map((user) => (
                        <li key={user.id}>
                            {user.name} - {user.email}
                        </li>
                    ))}
                </ul>
            </div>
        </main>
    );
}
`;

    return tpl;
}
