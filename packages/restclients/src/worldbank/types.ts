/*
Response shapes from https://api.worldbank.org/v2

Two things about this API are unlike every other client here, and both are
encoded in the types below.

First, every successful response is a two-element tuple: pagination metadata,
then the rows. There is no named envelope.

    [{page: 1, pages: 6, per_page: 50, total: 296}, [ ...countries ]]

Second, a failure is still HTTP 200 with an error body in place of the tuple,
so nothing rejects. `rowsOf()` is what turns that back into an exception --
see ./response.ts.
*/


/*
Pagination metadata.

The numeric fields come back as numbers on some endpoints and as strings on
others (`/region` sends strings, `/country` sends numbers), which is upstream's
inconsistency rather than ours.
*/
interface WorldBankMeta {
    page: number | string,
    pages: number | string,
    per_page: number | string,
    total: number | string,
    sourceid?: string,
    lastupdated?: string
}


type WorldBankResponse<T> = [WorldBankMeta, Array<T>];


/*
The error body. Note it is an array of one object, not the usual tuple -- and
it arrives with a 200 status.
*/
type WorldBankErrorBody = [{message: Array<{id: string, key: string, value: string}>}];


/* Either shape, which is what a method actually resolves to. */
type WorldBankPayload<T> = WorldBankResponse<T> | WorldBankErrorBody;


/* A code plus its label. The API uses this shape for every classification. */
interface CodeValue {
    id: string,
    iso2code?: string,
    value: string
}


interface WorldBankCountry {
    id: string,
    iso2Code: string,
    name: string,
    region: CodeValue,
    adminregion: CodeValue,
    incomeLevel: CodeValue,
    lendingType: CodeValue,
    capitalCity: string,
    longitude: string,
    latitude: string
}


/* `/region`, `/income-level`, `/lending-type` all answer with this. */
interface Classification {
    id: string,
    code: string,
    iso2code: string,
    name: string
}


interface IndicatorSource {
    id: string,
    value: string
}


interface Indicator {
    id: string,
    name: string,
    unit: string,
    source: IndicatorSource,
    sourceNote: string,
    sourceOrganization: string,
    topics: Array<{id?: string, value?: string}>
}


/*
One observation.

`value` is null for years with no data, which is common at the edges of a
series -- most indicators have no value for the current year yet.
*/
interface Observation {
    indicator: IndicatorSource,
    country: IndicatorSource,
    countryiso3code: string,
    date: string,
    value: number | null,
    unit: string,
    obs_status: string,
    decimal: number
}


interface Source {
    id: string,
    lastupdated: string,
    name: string,
    code: string,
    description: string,
    url: string,
    dataavailability: string,
    metadataavailability: string,
    concepts: string
}


/* Paging, shared by every endpoint. Default per_page is 50; the cap is 32767. */
interface PageOptions {
    page?: number,
    perPage?: number
}


interface CountryOptions extends PageOptions {
    /* Region, income and lending codes -- e.g. region: 'LCN'. */
    region?: string,
    incomeLevel?: string,
    lendingType?: string
}


interface ObservationOptions extends PageOptions {
    /*
    A year or an inclusive range: '2023' or '2000:2023'.
    */
    date?: string,
    /* Most recent N values instead of a date range. */
    mrv?: number,
    /* 'Y' drops years with no data from the response. */
    gapfill?: 'Y' | 'N',
    frequency?: 'Y' | 'Q' | 'M'
}


export type {WorldBankMeta, WorldBankResponse, WorldBankErrorBody, WorldBankPayload};
export type {WorldBankCountry, CodeValue, Classification};
export type {Indicator, IndicatorSource, Observation, Source};
export type {PageOptions, CountryOptions, ObservationOptions};
