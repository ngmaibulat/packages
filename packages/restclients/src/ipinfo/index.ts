export type {IpInfo, IpInfoError} from './types.ts';

export {IpInfoApi, baseUrl} from './services.ts';
export type {IpInfoOptions} from './services.ts';

/*
`HttpError` is re-exported so consumers can `instanceof`-check failures.
A non-2xx rejects with it; a transport failure rejects with fetch's own
TypeError, and an abort with a DOMException.
*/
export {HttpError} from '../core/index.ts';
export type {ClientOptions, RequestOptions, TypedResponse} from '../core/index.ts';
