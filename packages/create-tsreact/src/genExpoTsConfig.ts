//Nothing like the browser templates' tsconfig: expo ships its own base with
//the jsx factory, the react-native module resolution and the lib set already
//configured, so extending it is the whole file.
//
//expo-env.d.ts and .expo/types are written by "npx expo start" and are
//gitignored; referencing them before they exist is fine.
export default function genExpoTsConfig() {
    const tpl = `
{
    "extends": "expo/tsconfig.base",
    "compilerOptions": {
      "strict": true
    },
    "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
`;

    return tpl;
}
