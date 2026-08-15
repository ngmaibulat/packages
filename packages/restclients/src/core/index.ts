export {BaseApi} from './client.ts';
export type {ClientDefaults, ClientOptions, RequestOptions, TypedResponse} from './client.ts';

export {cleanQuery, encodeSegment} from './params.ts';
export type {Query, QueryValue} from './params.ts';

export {mergeHeaders} from './headers.ts';

/*
Re-exported so consumers can `instanceof`-check failures. A non-2xx rejects
with this; a transport failure rejects with fetch's own TypeError, and an
abort with a DOMException, both left as the platform produced them.
*/
export {HttpError} from './errors.ts';
