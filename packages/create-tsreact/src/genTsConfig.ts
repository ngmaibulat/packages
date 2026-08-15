import type { Opts } from "./cli.js";

//"types" is set only for the extension template. TypeScript does not pick
//@types/chrome up on its own here, and chrome is an ambient global rather
//than something you import. Listing it opts out of every *other* ambient
//@types package - harmless in this case, because @types/react and
//@types/react-dom are module types resolved through their imports.
//
//Note: background.ts actually runs in a ServiceWorkerGlobalScope, but the
//DOM lib below is needed for the popup, so `self` is typed as a Window there.
//The pwa template hits the same clash and cannot live with it, because sw.ts
//uses FetchEvent/ExtendableEvent - hence the exclude and tsconfig.sw.json.
export default function genTsConfig(o: Opts) {
    const types = o.template === "extension" ? `\n      "types": ["chrome"],` : "";

    const exclude = o.template === "pwa" ? `,\n    "exclude": ["src/sw.ts"]` : "";

    const tpl = `
{
    "compilerOptions": {
      "target": "ES2022",
      "useDefineForClassFields": true,
      "lib": ["DOM", "DOM.Iterable", "ES2022"],${types}
      "allowJs": true,
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
    "include": ["src"]${exclude}
}
`;
    return tpl;
}
