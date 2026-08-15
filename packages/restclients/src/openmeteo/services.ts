import type {Forecast, ForecastOptions, GeocodeResponse, GeocodeOptions} from './types.ts';
import {BaseApi} from '../core/index.ts';
import type {ClientOptions, RequestOptions} from '../core/index.ts';

const baseUrl = 'https://api.open-meteo.com/v1';

/*
Geocoding lives on its own host, so `geocode` passes an absolute URL. An
absolute url replaces `baseUrl` rather than being appended to it, which is
what makes one client able to span both services.
*/
const geocodingURL = 'https://geocoding-api.open-meteo.com/v1/search';

/* The archive lives on a third host, same request shape as the forecast. */
const archiveURL = 'https://archive-api.open-meteo.com/v1/archive';

class OpenMeteoApi extends BaseApi
{
    constructor(options: ClientOptions = {})
    {
        super({baseUrl}, options);
    }

    /*
    A forecast for one point.

    Variable lists may be arrays -- they are comma-joined, which is the only
    form Open-Meteo accepts:

        api.forecast({
            latitude: 52.52,
            longitude: 13.41,
            hourly: ['temperature_2m', 'wind_speed_10m'],
            timezone: 'auto'
        });

    Asking for no variables at all is valid and returns only the metadata.
    */
    async forecast(options: ForecastOptions, config?: RequestOptions)
    {
        const url = '/forecast';
        return this.httpGet<Forecast>(url, {...options}, config);
    }

    /*
    Past weather, from the archive host. Same options; `start_date` and
    `end_date` are required there.
    */
    async archive(options: ForecastOptions, config?: RequestOptions)
    {
        return this.httpGet<Forecast>(archiveURL, {...options}, config);
    }

    /*
    Turn a place name into coordinates. Different host, hence the absolute URL.
    `results` is absent rather than empty when nothing matches.
    */
    async geocode(name: string, options?: GeocodeOptions, config?: RequestOptions)
    {
        return this.httpGet<GeocodeResponse>(geocodingURL, {
            name,
            count: options?.count,
            language: options?.language,
            format: options?.format
        }, config);
    }

}

export {OpenMeteoApi, baseUrl, geocodingURL, archiveURL}
