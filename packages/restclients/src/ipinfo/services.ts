import type {IpInfo} from './types.ts';
import {BaseApi, encodeSegment} from '../core/index.ts';
import type {ClientOptions, RequestOptions} from '../core/index.ts';

const baseUrl = 'https://ipinfo.io';

interface IpInfoOptions extends ClientOptions {
    /*
    An ipinfo access token, sent as `Authorization: Bearer <token>`.

    Optional: ipinfo answers a limited number of requests a day without one
    (roughly a thousand from a given address) and then starts returning 429.
    A free token from https://ipinfo.io/signup raises that considerably.
    */
    token?: string
}

class IpInfoApi extends BaseApi
{
    constructor(options: IpInfoOptions = {})
    {
        const {token, ...config} = options;

        const headers: Record<string, string> = {};

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        super({baseUrl, headers}, config);
    }

    /*
    Look up an address, or the caller's own if none is given.

    A private or reserved address comes back as `{ip, bogon: true}` with no
    geolocation at all, so check `bogon` before reading `city` and friends.
    */
    async lookup(ip?: string, config?: RequestOptions)
    {
        const url = ip === undefined ? '/json' : `/${encodeSegment(ip)}/json`;
        return this.httpGet<IpInfo>(url, undefined, config);
    }

    /*
    A single field as plain text -- `country` answers `US\n`, not JSON.
    Cheaper than pulling the whole record when that is all you need.

    The only method here that returns a bare `Response`: read it with
    `await res.text()`, since `res.json()` would throw on `US\n`.
    */
    async field(ip: string, name: keyof IpInfo, config?: RequestOptions): Promise<Response>
    {
        const url = `/${encodeSegment(ip)}/${encodeSegment(name)}`;
        return this.httpGet<never>(url, undefined, config);
    }

}

export {IpInfoApi, baseUrl}
export type {IpInfoOptions}
