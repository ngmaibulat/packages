import type { Opts } from "./cli.js";

//The tsconfig every bundler-driven SPA gets: vite-spa, fastify-react's web
//half, and rsbuild-spa.
//
//Separate from genTsConfig.ts rather than another branch inside it: that one
//describes an esbuild app whose stylesheet needs a hand-written module
//declaration (src/env.d.ts), while this one gets the same thing from the
//bundler's own types - import.meta.env, the css and asset modules, and vite's
//?url / ?raw suffixes.
//
//That one "types" entry is the whole difference between the two bundlers, so
//it branches here rather than justifying a second near-identical file. Same
//call genEnvDts.ts makes for its one-line difference. Note that rsbuild's
//types arrive only through this array: unlike vite, there is no
//src/*-env.d.ts carrying a /// reference, so dropping the entry costs the
//rsbuild template every css import and every import.meta.env field at once.
//
//Setting "types" at all opts out of every other ambient @types package, which
//is fine here for the same reason it is in the extension template:
//@types/react and @types/react-dom are module types resolved through imports.
//
//noUnusedLocals and verbatimModuleSyntax are deliberately absent. Both are in
//vite's own scaffold, verbatimModuleSyntax is in rsbuild's recommended setup
//too, and all of them would fail the build on code this CLI generates rather
//than on code the user wrote - src/api/ is emitted from a Bruno collection and
//is shared with the templates that do not set them.
export default function genSpaTsConfig(o: Opts) {
    const types = o.template === "rsbuild-spa" ? `"@rsbuild/core/types"` : `"vite/client"`;

    const tpl = `
{
    "compilerOptions": {
        "target": "ES2022",
        "useDefineForClassFields": true,
        "lib": ["DOM", "DOM.Iterable", "ES2022"],
        "types": [${types}],
        "skipLibCheck": true,
        "esModuleInterop": true,
        "allowSyntheticDefaultImports": true,
        "strict": true,
        "forceConsistentCasingInFileNames": true,
        "module": "ESNext",
        "moduleResolution": "bundler",
        "resolveJsonModule": true,
        "isolatedModules": true,
        "noEmit": true,
        "jsx": "react-jsx"
    },
    "include": ["src"]
}
`;

    return tpl;
}
