# `@aibulat/restclients/worldbank`

[api.worldbank.org](https://datahelpdesk.worldbank.org/knowledgebase/topics/125589)
— every country, the classifications they belong to, and ~25000 development
indicators. No key, no rate limit, and it is a government dataset, so it does
not disappear.

```js
import {WorldBankApi, rowsOf} from '@aibulat/restclients/worldbank';

const api = new WorldBankApi();
const res = await api.getCountries({perPage: 300});
const countries = rowsOf(await res.json());

console.log(countries.length);   // 296
```

---

## Two things are unlike every other client here

**Every response is a tuple**, not a named envelope: pagination metadata,
then the rows.

```json
[{"page": 1, "pages": 6, "per_page": 50, "total": 296}, [ ... ]]
```

**A failure is still HTTP 200.** An unknown country code produces:

```json
[{"message": [{"id": "120", "key": "Invalid value", "value": "The provided parameter value is not valid"}]}]
```

and nothing rejects. That is why the helpers below
exist, and why methods are typed as `WorldBankPayload<T>` — the union of both
shapes — so you cannot reach the rows without passing through something that
considers the failure case.

They take the **parsed body**, not the response, so they stay synchronous now
that reading the body is an explicit step: `rowsOf(await res.json())`.

```ts
rowsOf(body): Array<T>              // the rows, or throws if the body was an error
metaOf(body): WorldBankMeta | undefined
hasMore(body): boolean
isErrorBody(body): boolean          // type guard
errorMessage(body): string
```

```js
const res = await api.getCountry('ZZZ');
const body = await res.json();

res.status;                 // 200
rowsOf(body);               // throws: World Bank API error -- Invalid value: ...
```

What it throws is a `WorldBankError`, so the case can be narrowed rather than
matched on its message. It is not an `HttpError`: nothing failed at the HTTP
layer, and `messages` carries the API's own list, ids and all.

```js
import {WorldBankError} from '@aibulat/restclients/worldbank';

try {
    rowsOf(body);
}
catch (err) {
    if (err instanceof WorldBankError) {
        console.log(err.messages[0].key);   // 'Invalid value'
    }
}
```

The client also sends `format=json` on every request as an instance default,
because the API answers in **XML** otherwise, on every endpoint, forever.

---

## Methods

```ts
getCountries(options?, config?)
getCountry(code, config?)                // ISO alpha-2 or alpha-3

getRegions(options?, config?)
getIncomeLevels(options?, config?)
getLendingTypes(options?, config?)
getSources(options?, config?)

getIndicators(options?, config?)
getIndicator(indicator, config?)

getCountryIndicator(code, indicator, options?, config?)
```

Paging is shared by all of them — `{page?, perPage?}`, default 50 per page.
`getCountries` also takes `region`, `incomeLevel` and `lendingType` filters:

```js
rowsOf(await api.getCountries({region: 'LCN', perPage: 100}));
```

`getCountryIndicator` takes `{date, mrv, gapfill, frequency}` on top of paging:

```js
const series = rowsOf(await api.getCountryIndicator('PER', 'SP.POP.TOTL', {date: '2000:2023'}));

series[0];   // {indicator: {...}, country: {...}, date: '2023', value: 33845617, ...}
```

`code` may be several codes joined with a semicolon (`'PER;CHL'`), or `'all'`
for every country. Observations come back **newest first**, and `value` is
`null` for years with no data — common at the edges of a series, since most
indicators have nothing for the current year yet.

Useful indicator ids: `SP.POP.TOTL` (population), `NY.GDP.MKTP.CD` (GDP,
current US$), `SP.DYN.LE00.IN` (life expectancy).

---

## Types

`WorldBankCountry`, `Classification` (the shape `/region`, `/incomeLevel` and
`/lendingType` share), `Indicator`, `Observation`, `Source`, plus `CodeValue`
for the `{id, iso2code, value}` pairs used throughout.

```ts
type WorldBankResponse<T> = [WorldBankMeta, Array<T>];
type WorldBankErrorBody = [{message: Array<{id, key, value}>}];
type WorldBankPayload<T> = WorldBankResponse<T> | WorldBankErrorBody;
```

`WorldBankMeta` types its numbers as `number | string`. That is not
defensiveness — `/region` genuinely sends strings where `/country` sends
numbers. `hasMore()` coerces before comparing, so you do not have to.

---

## Notes

- **The country list includes aggregates.** Around 70 of the 296 rows are
  regions and income groups, not countries. Filter with `region` to exclude
  them, or check `region.value` against `'Aggregates'`.
- **`getIndicators` is 25000 rows** across hundreds of pages. Page through it
  rather than trying to fetch it all.
