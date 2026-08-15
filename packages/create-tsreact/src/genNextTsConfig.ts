//Every value here is what Next 16 itself writes on first "next dev" - it
//rewrites tsconfig.json in place and reports what it changed. Generating the
//settled version means the first dev run reports nothing and leaves no diff.
//
//Two of them are easy to get wrong from older documentation:
//
//  "jsx": "react-jsx"   Next calls this a *mandatory* change and overwrites
//                       "preserve" on sight. Preserve is the pre-automatic
//                       -runtime setting and no longer applies.
//  ".next/dev/types"    Next 16 emits route types under .next/dev/types as
//                       well as .next/types. Both are needed, or PageProps
//                       and LayoutProps go unresolved after a dev run.
//
//The "next" plugin entry gives the editor typed routes and server-component
//diagnostics. It is a language-service plugin, so it changes nothing about
//"tsc --noEmit" but its absence is immediately noticeable while editing.
export default function genNextTsConfig() {
    const tpl = `
{
    "compilerOptions": {
        "target": "ES2022",
        "lib": ["DOM", "DOM.Iterable", "ES2022"],
        "allowJs": true,
        "skipLibCheck": true,
        "strict": true,
        "noEmit": true,
        "esModuleInterop": true,
        "module": "ESNext",
        "moduleResolution": "bundler",
        "resolveJsonModule": true,
        "isolatedModules": true,
        "jsx": "react-jsx",
        "incremental": true,
        "plugins": [
            {
                "name": "next"
            }
        ],
        "paths": {
            "@/*": ["./src/*"]
        }
    },
    "include": [
        "next-env.d.ts",
        "**/*.ts",
        "**/*.tsx",
        ".next/types/**/*.ts",
        ".next/dev/types/**/*.ts"
    ],
    "exclude": ["node_modules"]
}
`;

    return tpl;
}
