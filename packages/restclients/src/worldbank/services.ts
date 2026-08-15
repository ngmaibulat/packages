import type {WorldBankResponse, WorldBankPayload} from './types.ts';
import type {WorldBankCountry, Classification, Indicator, Observation, Source} from './types.ts';
import type {PageOptions, CountryOptions, ObservationOptions} from './types.ts';
import {BaseApi, encodeSegment} from '../core/index.ts';
import type {Query, ClientOptions, RequestOptions} from '../core/index.ts';

const baseUrl = 'https://api.worldbank.org/v2';

/*
The API answers in XML unless you ask otherwise, on every endpoint, forever.
Sending it as an instance default rather than per method means no call can
forget it.
*/
const defaultParams = {format: 'json'};

/*
`code` is documented as one country code or several joined with a semicolon
('PER;CHL'), so the separator has to survive. Each part is encoded on its own
and the semicolons are put back -- encoding the whole string would turn the
separator into %3B and make it one nonsense code.
*/
function encodeCodes(code: string): string
{
    return code.split(';').map((part) => encodeSegment(part)).join(';');
}

class WorldBankApi extends BaseApi
{
    constructor(options: ClientOptions = {})
    {
        super({baseUrl}, {
            ...options,
            params: {...defaultParams, ...options.params}
        });
    }

    private pageQuery(options?: PageOptions): Query
    {
        return {
            page: options?.page,
            per_page: options?.perPage
        };
    }


    //Countries

    /*
    Every country, plus the ~70 aggregate rows (regions, income groups) the
    API mixes into the same collection. Filter with `region` to exclude them.

    Default page size is 50; pass `perPage: 300` to get them all at once.
    */
    async getCountries(options?: CountryOptions, config?: RequestOptions)
    {
        const url = '/country';
        return this.httpGet<WorldBankPayload<WorldBankCountry>>(url, {
            ...this.pageQuery(options),
            region: options?.region,
            incomeLevel: options?.incomeLevel,
            lendingType: options?.lendingType
        }, config);
    }

    /*
    One country by ISO 3166-1 alpha-2 or alpha-3 code.

    An unknown code is not a 404 -- it is a 200 with an error body. Use
    `rowsOf()` to turn that back into an exception.
    */
    async getCountry(code: string, config?: RequestOptions)
    {
        const url = `/country/${encodeCodes(code)}`;
        return this.httpGet<WorldBankPayload<WorldBankCountry>>(url, undefined, config);
    }


    //Classifications - the code lists the country records refer to

    async getRegions(options?: PageOptions, config?: RequestOptions)
    {
        const url = '/region';
        return this.httpGet<WorldBankPayload<Classification>>(url, this.pageQuery(options), config);
    }

    async getIncomeLevels(options?: PageOptions, config?: RequestOptions)
    {
        const url = '/incomeLevel';
        return this.httpGet<WorldBankPayload<Classification>>(url, this.pageQuery(options), config);
    }

    async getLendingTypes(options?: PageOptions, config?: RequestOptions)
    {
        const url = '/lendingType';
        return this.httpGet<WorldBankPayload<Classification>>(url, this.pageQuery(options), config);
    }

    async getSources(options?: PageOptions, config?: RequestOptions)
    {
        const url = '/source';
        return this.httpGet<WorldBankPayload<Source>>(url, this.pageQuery(options), config);
    }


    //Indicators - there are around 25000 of them, so search by page rather
    //than trying to list them all. Useful ids: SP.POP.TOTL (population),
    //NY.GDP.MKTP.CD (GDP), SP.DYN.LE00.IN (life expectancy).

    async getIndicators(options?: PageOptions, config?: RequestOptions)
    {
        const url = '/indicator';
        return this.httpGet<WorldBankPayload<Indicator>>(url, this.pageQuery(options), config);
    }

    async getIndicator(indicator: string, config?: RequestOptions)
    {
        const url = `/indicator/${encodeSegment(indicator)}`;
        return this.httpGet<WorldBankPayload<Indicator>>(url, undefined, config);
    }


    //Observations - the actual data

    /*
    A time series for one country and one indicator.

        api.getCountryIndicator('PER', 'SP.POP.TOTL', {date: '2000:2023'})

    `code` may be several codes joined with a semicolon ('PER;CHL'), and 'all'
    means every country. Observations come back newest first, and `value` is
    null for years with no data.
    */
    async getCountryIndicator(code: string, indicator: string, options?: ObservationOptions, config?: RequestOptions)
    {
        const url = `/country/${encodeCodes(code)}/indicator/${encodeSegment(indicator)}`;
        return this.httpGet<WorldBankPayload<Observation>>(url, {
            ...this.pageQuery(options),
            date: options?.date,
            mrv: options?.mrv,
            gapfill: options?.gapfill,
            frequency: options?.frequency
        }, config);
    }

}

export {WorldBankApi, baseUrl, defaultParams}
export type {WorldBankResponse}
