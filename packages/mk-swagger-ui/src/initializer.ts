import { BUNDLE_NAME } from "./assets";

export interface InitializerOptions {
    /** Name of the converted spec inside the output directory. */
    specFile: string;
    /**
     * Load Scalar's default webfonts from fonts.scalar.com.
     *
     * Off by default: the generated folder is meant to be deployable anywhere,
     * including a machine with no route to the internet, and a page that
     * silently falls back to system fonts behind a firewall is not what the
     * preview showed.
     */
    fonts?: boolean;
}

/** Escape a string for use inside an HTML text node or attribute. */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * The script that mounts Scalar onto the page.
 *
 * Kept as its own file rather than inlined into index.html so the rendered
 * document's configuration can be edited after generation -- the same role
 * `swagger-initializer.js` played in the Swagger UI output.
 *
 * `proxyUrl` is deliberately not set. Scalar's hosted proxy would route the
 * "Test Request" traffic of every visitor through scalar.com; leaving it out
 * means those requests go straight to the API, subject to its CORS policy.
 */
export function scalarInitializer(options: InitializerOptions): string {
    const { specFile, fonts = false } = options;

    return `Scalar.createApiReference("#app", {
    url: ${JSON.stringify(specFile)},
    withDefaultFonts: ${fonts},
});
`;
}

/** The page that loads the bundle and the initializer. */
export function indexHtml(title: string): string {
    return `<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
            body {
                margin: 0;
            }
        </style>
    </head>
    <body>
        <div id="app"></div>
        <script src="./${BUNDLE_NAME}"></script>
        <script src="./scalar-initializer.js"></script>
    </body>
</html>
`;
}
