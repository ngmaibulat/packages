//A second tsconfig purely because of a lib clash: ServiceWorkerGlobalScope,
//ExtendableEvent and FetchEvent live in lib.webworker.d.ts, which cannot be
//loaded alongside DOM - and tsconfig.json needs DOM for app.tsx. So sw.ts is
//excluded there and type-checked here instead, which is why "npm run
//typecheck" runs tsc twice.
export default function genSwTsConfig() {
    const tpl = `
{
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022", "WebWorker"],
      "skipLibCheck": true,
      "strict": true,
      "forceConsistentCasingInFileNames": true,
      "module": "ESNext",
      "moduleResolution": "bundler",
      "isolatedModules": true,
      "noEmit": true
    },
    "include": ["src/sw.ts"]
}
`;

    return tpl;
}
