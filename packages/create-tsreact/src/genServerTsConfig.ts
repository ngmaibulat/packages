//No DOM lib and no jsx: this half of the monorepo never runs in a browser,
//and letting DOM in means a typo like "document" or "localStorage" compiles
//cleanly and then throws at runtime.
//
//"module"/"moduleResolution" are NodeNext rather than the bundler pair the
//web workspace uses. rolldown would accept either, but "tsx watch" runs the
//sources through node's own resolver in dev, and only NodeNext models that
//faithfully - including the rule that relative imports carry an extension.
export default function genServerTsConfig() {
    const tpl = `
{
    "compilerOptions": {
        "target": "ES2023",
        "lib": ["ES2023"],
        "types": ["node"],
        "skipLibCheck": true,
        "esModuleInterop": true,
        "strict": true,
        "forceConsistentCasingInFileNames": true,
        "module": "NodeNext",
        "moduleResolution": "nodenext",
        "resolveJsonModule": true,
        "isolatedModules": true,
        "noEmit": true
    },
    "include": ["src", "rolldown.config.ts"]
}
`;

    return tpl;
}
