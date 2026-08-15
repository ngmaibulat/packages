import type { Opts } from "./cli.js";

//The root layout is the only place globals.css can be imported from - Next
//hoists it into every route from here, and importing it anywhere else in the
//app directory is a build error.
export default function genNextLayoutTsx(o: Opts) {
    //TanStack Query needs a client component to hold the provider, so unlike
    //the other templates the wrapper is a separate module rather than a few
    //lines spliced in here. See genProvidersTsx.ts.
    const providers = o.api
        ? {
              imports: `\nimport { Providers } from "./providers";\n`,
              body: `
                <Providers>{children}</Providers>
            `,
          }
        : { imports: "", body: `{children}` };

    const tpl = `
import type { Metadata } from "next";
${providers.imports}
import "./globals.css";

export const metadata: Metadata = {
    title: "${o.name}",
    description: "Created by tsreact",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en">
            <body>${providers.body}</body>
        </html>
    );
}
`;

    return tpl;
}
