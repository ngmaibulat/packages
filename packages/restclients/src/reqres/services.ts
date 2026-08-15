import type {ReqresUser, ReqresResource, Single, Paginated} from './types.ts';
import type {NewReqresUser, CreatedReqresUser, UpdatedReqresUser} from './types.ts';
import type {Credentials, RegisterResponse, LoginResponse} from './types.ts';
import {BaseApi} from '../core/index.ts';
import type {ClientOptions, RequestOptions} from '../core/index.ts';

const baseUrl = 'https://reqres.in/api';

/*
reqres's publicly documented demo key.

Treat it as best-effort only: reqres rotates and throttles it, and it has
been observed answering 401 `missing_api_key` for the very URLs it had served
minutes earlier. Anything beyond the occasional legacy demo request needs your
own key from https://app.reqres.in/api-keys

    new ReqresApi({apiKey: 'your-key'})
*/
const freeApiKey = 'reqres-free-v1';

interface ReqresOptions extends ClientOptions {
    /* Sent as the `x-api-key` header. Defaults to the shared demo key. */
    apiKey?: string
}

class ReqresApi extends BaseApi
{
    constructor(options: ReqresOptions = {})
    {
        const {apiKey = freeApiKey, ...config} = options;

        super({baseUrl, headers: {'x-api-key': apiKey}}, config);
    }


    //Users - `delay` is a reqres feature that holds the response for N
    //seconds, which is handy for exercising timeout handling.

    async getUsers(page?: number, delay?: number, config?: RequestOptions)
    {
        const url = '/users';
        return this.httpGet<Paginated<ReqresUser>>(url, {page, delay}, config);
    }

    async getUser(id: number, config?: RequestOptions)
    {
        const url = `/users/${id}`;
        return this.httpGet<Single<ReqresUser>>(url, undefined, config);
    }

    async createUser(item: NewReqresUser, config?: RequestOptions)
    {
        const url = '/users';
        return this.httpSend<CreatedReqresUser>('POST', url, item, config);
    }

    async updateUser(id: number, item: NewReqresUser, config?: RequestOptions)
    {
        const url = `/users/${id}`;
        return this.httpSend<UpdatedReqresUser>('PUT', url, item, config);
    }

    async patchUser(id: number, item: Partial<NewReqresUser>, config?: RequestOptions)
    {
        const url = `/users/${id}`;
        return this.httpSend<UpdatedReqresUser>('PATCH', url, item, config);
    }

    async deleteUser(id: number, config?: RequestOptions)
    {
        const url = `/users/${id}`;
        return this.httpSend<void>('DELETE', url, undefined, config);
    }


    //Resources - reqres calls this collection "unknown"

    async getResources(page?: number, delay?: number, config?: RequestOptions)
    {
        const url = '/unknown';
        return this.httpGet<Paginated<ReqresResource>>(url, {page, delay}, config);
    }

    async getResource(id: number, config?: RequestOptions)
    {
        const url = `/unknown/${id}`;
        return this.httpGet<Single<ReqresResource>>(url, undefined, config);
    }


    //Auth - omitting a field makes reqres answer 400 with a ReqresError body

    async register(credentials: Credentials, config?: RequestOptions)
    {
        const url = '/register';
        return this.httpSend<RegisterResponse>('POST', url, credentials, config);
    }

    async login(credentials: Credentials, config?: RequestOptions)
    {
        const url = '/login';
        return this.httpSend<LoginResponse>('POST', url, credentials, config);
    }

}

export {ReqresApi, baseUrl, freeApiKey}
export type {ReqresOptions}
