/*
Response shapes from https://open-meteo.com

Open-Meteo is column-oriented: you name the variables you want and it returns
one parallel array per variable, all indexed by the same `time` array. That is
why the blocks below are `Record<string, Array<...>>` rather than a fixed set
of fields -- the caller picks the variables at the call site, so their names
are not knowable here.
*/


/*
A weather block. `time` is always present; every other key is one of the
variables you asked for, in the same order and length as `time`.

    const {time, temperature_2m} = (await res.json()).hourly ?? {};
*/
interface TimeSeries {
    time: Array<string>,
    [variable: string]: Array<string | number | null> | Array<string>
}


/* The units Open-Meteo used, keyed the same way as the block itself. */
interface Units {
    time?: string,
    [variable: string]: string | undefined
}


/* `current` is a single reading rather than a series. */
interface CurrentWeather {
    time: string,
    interval?: number,
    [variable: string]: string | number | null | undefined
}


interface Forecast {
    latitude: number,
    longitude: number,
    generationtime_ms: number,
    utc_offset_seconds: number,
    timezone: string,
    timezone_abbreviation: string,
    elevation: number,
    current?: CurrentWeather,
    current_units?: Units,
    hourly?: TimeSeries,
    hourly_units?: Units,
    daily?: TimeSeries,
    daily_units?: Units
}


/*
Forecast options.

Array values are comma-joined by the shared params helper, which is the only
form Open-Meteo accepts -- a repeated `hourly=a&hourly=b` is rejected.

`timezone: 'auto'` is worth knowing: it resolves the zone from the
coordinates, which is almost always what you want for a daily forecast.
*/
interface ForecastOptions {
    latitude: number,
    longitude: number,
    hourly?: string | Array<string>,
    daily?: string | Array<string>,
    current?: string | Array<string>,
    timezone?: string,
    forecast_days?: number,
    past_days?: number,
    start_date?: string,
    end_date?: string,
    temperature_unit?: 'celsius' | 'fahrenheit',
    wind_speed_unit?: 'kmh' | 'ms' | 'mph' | 'kn',
    precipitation_unit?: 'mm' | 'inch'
}


interface GeocodeResult {
    id: number,
    name: string,
    latitude: number,
    longitude: number,
    elevation?: number,
    feature_code?: string,
    country_code?: string,
    country?: string,
    admin1?: string,
    admin2?: string,
    timezone?: string,
    population?: number,
    postcodes?: Array<string>
}


/* `results` is absent, not empty, when nothing matches. */
interface GeocodeResponse {
    results?: Array<GeocodeResult>,
    generationtime_ms: number
}


interface GeocodeOptions {
    count?: number,
    language?: string,
    format?: 'json'
}


/* Open-Meteo signals failure with a 400 and this body. */
interface OpenMeteoError {
    error: boolean,
    reason: string
}


export type {Forecast, TimeSeries, Units, CurrentWeather, ForecastOptions};
export type {GeocodeResponse, GeocodeResult, GeocodeOptions, OpenMeteoError};
