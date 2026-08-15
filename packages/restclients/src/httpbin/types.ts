/*
Response shapes from https://httpbin.org

httpbin is not a data API -- it is a behaviour API. Every echo endpoint
returns the same envelope describing the request it just received, which is
what makes it useful for exercising timeouts, retries, redirects and
a `fetch` wrapper against something real.
*/

interface HttpbinEcho {
    args: Record<string, string>,
    headers: Record<string, string>,
    origin: string,
    url: string,
    /* Present on the write verbs only. */
    data?: string,
    json?: unknown,
    form?: Record<string, string>,
    files?: Record<string, string>
}


interface HttpbinHeaders {
    headers: Record<string, string>
}


interface HttpbinOrigin {
    origin: string
}


interface HttpbinUserAgent {
    'user-agent': string
}


interface HttpbinUuid {
    uuid: string
}


/*
Returned by /basic-auth and /bearer once the credentials are accepted.
A rejected credential is a 401 with no body.
*/
interface HttpbinAuth {
    authenticated: boolean,
    user?: string,
    token?: string
}


/* The fixed sample document served by /json. */
interface HttpbinSlideshow {
    slideshow: {
        author: string,
        date: string,
        title: string,
        slides: Array<{title: string, type: string, items?: Array<string>}>
    }
}


export type {HttpbinEcho, HttpbinHeaders, HttpbinOrigin, HttpbinUserAgent};
export type {HttpbinUuid, HttpbinAuth, HttpbinSlideshow};
