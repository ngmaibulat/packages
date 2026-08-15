export type {WorldBankMeta, WorldBankResponse, WorldBankErrorBody, WorldBankPayload} from './types.ts';
export type {WorldBankCountry, CodeValue, Classification} from './types.ts';
export type {Indicator, IndicatorSource, Observation, Source} from './types.ts';
export type {PageOptions, CountryOptions, ObservationOptions} from './types.ts';

export {WorldBankApi, baseUrl, defaultParams} from './services.ts';

/*
The API reports failure with a 200 and an error body, so nothing rejects on
its own. These unwrap the tuple and make that case loud.
*/
export {isErrorBody, errorMessage, rowsOf, metaOf, hasMore} from './response.ts';

/*
What `rowsOf()` throws on that 200-with-an-error-body. Exported so the case
can be `instanceof`-checked rather than matched on the message string --
`HttpError` covers the HTTP layer, and this one is the layer above it.
*/
export {WorldBankError} from './response.ts';

/*
`HttpError` is re-exported so consumers can `instanceof`-check failures.
A non-2xx rejects with it; a transport failure rejects with fetch's own
TypeError, and an abort with a DOMException.
*/
export {HttpError} from '../core/index.ts';
export type {ClientOptions, RequestOptions, TypedResponse} from '../core/index.ts';
