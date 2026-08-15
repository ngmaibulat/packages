import { baseUrl, str } from "./emit.js";
import type { ApiSpec } from "./spec.js";

//The one file under src/api/ that is NOT regenerated. Everything else there
//is overwritten by "npm run api:gen", so the hand-editable settings - base
//url, credentials, extra headers - live here on their own. Without the split
//the first regeneration would silently throw the user's token away.
//
//The base url is the longest common prefix of the collection's resolved urls,
//so it is whatever environment the collection was read with. The token is
//deliberately left empty even when the collection had one: a scaffolder must
//not write a credential into a file destined for git.
export default function configTs(spec: ApiSpec) {
    const base = baseUrl(spec);

    const note = spec.secrets.length
        ? `\n//The collection declares these as secrets: ${spec.secrets.join(
              ", ",
          )}.\n//Bruno keeps their values outside the .bru files, so they are not here either.`
        : "";

    const tpl = `
//Settings for the generated API client.
//
//This is the only file under src/api/ that "npm run api:gen" leaves alone -
//everything else here is overwritten. Edit freely.${note}

export type ApiConfig = {
    baseUrl: string;
    //sent as "Authorization: Bearer <token>" when set
    token?: string;
    //merged into every request, after the generated per-request headers
    headers?: Record<string, string>;
};

export const config: ApiConfig = {
    baseUrl: ${str(base)},
    token: undefined,
};
`;

    return tpl;
}
