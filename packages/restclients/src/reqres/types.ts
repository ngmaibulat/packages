/*
Entities and envelopes as returned by https://reqres.in

reqres wraps every payload in a `data` property and appends a promotional
`support` block. Newer responses also carry an undocumented `_meta` object;
it is typed loosely on purpose so a change upstream is not a breaking change here.
*/

interface Support {
    url: string,
    text: string
}


interface ReqresUser {
    id: number,
    email: string,
    first_name: string,
    last_name: string,
    avatar: string
}


interface ReqresResource {
    id: number,
    name: string,
    year: number,
    color: string,
    pantone_value: string
}


interface Single<T> {
    data: T,
    support?: Support,
    _meta?: Record<string, unknown>
}


interface Paginated<T> {
    page: number,
    per_page: number,
    total: number,
    total_pages: number,
    data: Array<T>,
    support?: Support,
    _meta?: Record<string, unknown>
}


/*
Write and auth payloads.

reqres persists nothing -- these responses are synthesised per request.
*/

interface NewReqresUser {
    name: string,
    job: string
}


interface CreatedReqresUser {
    name: string,
    job: string,
    id: string,
    createdAt: string
}


interface UpdatedReqresUser {
    name: string,
    job: string,
    updatedAt: string
}


interface Credentials {
    email: string,
    password: string
}


interface RegisterResponse {
    id: number,
    token: string
}


interface LoginResponse {
    token: string
}


/*
Error body returned for a missing or rejected api key, and for
register/login calls that omit a field.
*/
interface ReqresError {
    error: string,
    message?: string,
    hint?: string,
    next_steps?: Array<string>,
    docs_url?: string,
    _meta?: Record<string, unknown>
}


export type {Support, ReqresUser, ReqresResource};
export type {Single, Paginated};
export type {NewReqresUser, CreatedReqresUser, UpdatedReqresUser};
export type {Credentials, RegisterResponse, LoginResponse, ReqresError};
