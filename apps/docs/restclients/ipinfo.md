# `@aibulat/restclients/ipinfo`

[ipinfo.io](https://ipinfo.io) — IP geolocation. Works without a key for
roughly a thousand requests a day per address; a free token from
[ipinfo.io/signup](https://ipinfo.io/signup) raises that considerably.

```js
import {IpInfoApi} from '@aibulat/restclients/ipinfo';

const api = new IpInfoApi({token: process.env.IPINFO_TOKEN});
const res = await api.lookup('8.8.8.8');
const info = await res.json();

console.log(info.city, info.country);   // Mountain View US
```

---

## Methods

```ts
lookup(ip?, config?)          // -> IpInfo; no argument means "the caller"
field(ip, name, config?)      // -> string; one field as plain text
```

`field` is cheaper when one value is all you need — `country` answers `US\n`,
not JSON. The field name is typed against `IpInfo`, so a typo does not compile.

---

## Types

```ts
interface IpInfo {
    ip: string,
    hostname?: string,
    city?: string,
    region?: string,
    country?: string,
    loc?: string,        // "lat,lng" in one string
    org?: string,        // "AS15169 Google LLC"
    postal?: string,
    timezone?: string,
    anycast?: boolean,
    bogon?: boolean
}
```

Everything below `ip` is optional, for two reasons: which fields appear
depends on your plan and on how much ipinfo knows about the address, and a
private address returns almost nothing at all.

**Check `bogon` first.** A private, reserved or loopback address comes back as
`{ip, bogon: true}` with no geolocation:

```js
const info = await (await api.lookup('192.168.0.1')).json();

if (info.bogon) {
    console.log('private address, nothing to geolocate');
}
```

`loc` has always been a single `"lat,lng"` string rather than two numbers:

```js
const [lat, lng] = (info.loc ?? '0,0').split(',').map(Number);
```

Errors are `IpInfoError` — `{status, error: {title, message}}`. An exhausted
quota is a **429**.
