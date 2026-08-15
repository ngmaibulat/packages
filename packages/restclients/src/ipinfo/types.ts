/*
Response shapes from https://ipinfo.io
*/

/*
A public address.

`loc` is "lat,lng" as a single string -- ipinfo has always sent it that way.
`org` is "ASxxxx Org Name". Which fields appear depends on the plan and on how
much ipinfo knows about the address, so everything below the address itself is
optional.
*/
interface IpInfo {
    ip: string,
    hostname?: string,
    city?: string,
    region?: string,
    country?: string,
    loc?: string,
    org?: string,
    postal?: string,
    timezone?: string,
    anycast?: boolean,
    /*
    Set on a private, reserved or loopback address, in which case `ip` is the
    only other field you get back. Check this before reading anything else.
    */
    bogon?: boolean
}


/* The error body for a rejected or exhausted token. */
interface IpInfoError {
    status: number,
    error: {
        title: string,
        message: string
    }
}


export type {IpInfo, IpInfoError};
