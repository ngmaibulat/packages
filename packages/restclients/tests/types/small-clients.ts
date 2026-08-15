/*
Compile-time assertions for the ipinfo, open-meteo and world bank clients.
See ./jsonplaceholder.ts for why these files exist.
*/

import type {TypedResponse} from '../../src/core/index.ts';

import {IpInfoApi} from '../../src/ipinfo/index.ts';
import type {IpInfo} from '../../src/ipinfo/index.ts';

import {OpenMeteoApi} from '../../src/openmeteo/index.ts';
import type {Forecast, GeocodeResponse} from '../../src/openmeteo/index.ts';

import {WorldBankApi, rowsOf, metaOf} from '../../src/worldbank/index.ts';
import type {WorldBankPayload, WorldBankCountry, Observation, Classification} from '../../src/worldbank/index.ts';


//ipinfo

const ipi = new IpInfoApi();

const _own: Promise<TypedResponse<IpInfo>> = ipi.lookup();
const _one: Promise<TypedResponse<IpInfo>> = ipi.lookup('8.8.8.8');

/*
The one method that returns a bare `Response`: the body is text, so there is
no payload type to narrow `json()` to. Read it with `res.text()`.

The previous annotation here was `TypedResponse<string>`, which compiled only
because `Response['json']` returns `Promise<any>` -- so it asserted nothing,
and read as the opposite of what the method actually does.
*/
const _field: Promise<Response> = ipi.field('8.8.8.8', 'country');

// @ts-expect-error -- only real IpInfo keys are addressable
ipi.field('8.8.8.8', 'planet');

const _tokened = new IpInfoApi({token: 'tok_1'});


//open-meteo

const om = new OpenMeteoApi();

const _forecast: Promise<TypedResponse<Forecast>> = om.forecast({latitude: 52.52, longitude: 13.41});
const _geocode: Promise<TypedResponse<GeocodeResponse>> = om.geocode('Berlin');

/* The archive answers the same shape as the forecast, from another host. */
const _archive: Promise<TypedResponse<Forecast>> = om.archive({
    latitude: 52.52,
    longitude: 13.41,
    start_date: '2020-01-01',
    end_date: '2020-01-31'
});

om.forecast({
    latitude: 52.52,
    longitude: 13.41,
    hourly: ['temperature_2m', 'wind_speed_10m'],
    daily: 'sunrise',
    timezone: 'auto',
    temperature_unit: 'fahrenheit'
});

// @ts-expect-error -- coordinates are not optional
om.forecast({latitude: 52.52});

// @ts-expect-error -- the unit is a fixed union
om.forecast({latitude: 0, longitude: 0, temperature_unit: 'kelvin'});

// @ts-expect-error -- a typo'd option is not silently ignored
om.forecast({latitude: 0, longitude: 0, hourl: 'temperature_2m'});

/* Both blocks are optional: you get back only what you asked for. */
declare const forecast: Forecast;
const _hourly: Forecast['hourly'] = forecast.hourly;

// @ts-expect-error -- hourly is absent unless it was requested
const _alwaysThere: NonNullable<Forecast['hourly']> = forecast.hourly;


//world bank

const wb = new WorldBankApi();

/*
Every response is either the [meta, rows] tuple or an error body, because the
API reports failure with a 200. The union is the point: you cannot reach the
rows without going through a helper that considers the failure case.
*/
const _countries: Promise<TypedResponse<WorldBankPayload<WorldBankCountry>>> = wb.getCountries();
const _country: Promise<TypedResponse<WorldBankPayload<WorldBankCountry>>> = wb.getCountry('PER');
const _regions: Promise<TypedResponse<WorldBankPayload<Classification>>> = wb.getRegions();
const _series: Promise<TypedResponse<WorldBankPayload<Observation>>> = wb.getCountryIndicator('PER', 'SP.POP.TOTL');

// @ts-expect-error -- the payload is not a bare array of countries
const _bare: Promise<TypedResponse<Array<WorldBankCountry>>> = wb.getCountries();

// @ts-expect-error -- a country list is not a list of observations
const _crossed: Promise<TypedResponse<WorldBankPayload<Observation>>> = wb.getCountries();

wb.getCountries({region: 'LCN', perPage: 300, page: 2});
wb.getCountryIndicator('PER', 'SP.POP.TOTL', {date: '2000:2023', mrv: 5, gapfill: 'Y'});

// @ts-expect-error -- gapfill is a two-value union
wb.getCountryIndicator('PER', 'SP.POP.TOTL', {gapfill: 'yes'});

// @ts-expect-error -- the param is perPage, not the wire name per_page
wb.getCountries({per_page: 300});

/*
The helpers recover the element type from the payload. They take the parsed
body, which is what `res.json()` on a worldbank method resolves to.
*/
declare const countriesResponse: TypedResponse<WorldBankPayload<WorldBankCountry>>;
declare const countries: WorldBankPayload<WorldBankCountry>;

const _rows: Array<WorldBankCountry> = rowsOf(countries);
const _capital: string | undefined = rowsOf(countries)[0]?.capitalCity;
const _total = metaOf(countries)?.total;

const _awaited: Promise<Array<WorldBankCountry>> = countriesResponse.json().then(rowsOf);

// @ts-expect-error -- metaOf may be undefined when the body was an error
const _alwaysMeta: string | number = metaOf(countries)?.total;

// @ts-expect-error -- rowsOf keeps the element type, it does not widen to unknown
const _wrongRows: Array<Observation> = rowsOf(countries);

// @ts-expect-error -- the helpers take the parsed body, not the response
rowsOf(countriesResponse);


export type {};
