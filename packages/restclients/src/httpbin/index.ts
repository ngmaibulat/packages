export type {HttpbinEcho, HttpbinHeaders, HttpbinOrigin, HttpbinUserAgent} from './types.ts';
export type {HttpbinUuid, HttpbinAuth, HttpbinSlideshow} from './types.ts';

export {HttpbinApi, baseUrl} from './services.ts';

/*
`HttpError` is re-exported so consumers can `instanceof`-check failures.
A non-2xx rejects with it; a transport failure rejects with fetch's own
TypeError, and an abort with a DOMException.
*/
export {HttpError} from '../core/index.ts';
export type {ClientOptions, RequestOptions, TypedResponse} from '../core/index.ts';
