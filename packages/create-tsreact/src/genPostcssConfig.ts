//Tailwind 4 for Next goes through postcss rather than through a bundler
//plugin: @tailwindcss/vite has no Turbopack equivalent, and this is the setup
//Tailwind documents for Next.
//
//".mjs" rather than ".js" because the generated package.json has no
//"type": "module" - the Next convention - so a bare .js file here would be
//parsed as CommonJS and the export ignored.
export default function genPostcssConfig() {
    const tpl = `
const config = {
    plugins: {
        "@tailwindcss/postcss": {},
    },
};

export default config;
`;

    return tpl;
}
