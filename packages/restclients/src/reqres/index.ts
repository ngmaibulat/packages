export type {Support, ReqresUser, ReqresResource} from './types.ts';
export type {Single, Paginated} from './types.ts';
export type {NewReqresUser, CreatedReqresUser, UpdatedReqresUser} from './types.ts';
export type {Credentials, RegisterResponse, LoginResponse, ReqresError} from './types.ts';

export {ReqresApi, baseUrl, freeApiKey} from './services.ts';
export type {ReqresOptions} from './services.ts';

/*
`HttpError` is re-exported so consumers can `instanceof`-check failures.
A non-2xx rejects with it; a transport failure rejects with fetch's own
TypeError, and an abort with a DOMException.
*/
export {HttpError} from '../core/index.ts';
export type {ClientOptions, RequestOptions, TypedResponse} from '../core/index.ts';
