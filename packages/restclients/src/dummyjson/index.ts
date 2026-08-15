export type {DummyPage} from './types.ts';
export type {Product, Category, Dimensions, Review, ProductMeta} from './types.ts';
export type {DummyUser, DummyAddress, DummyCompany} from './types.ts';
export type {DummyPost, DummyComment, DummyTodo, Reactions} from './types.ts';
export type {Cart, CartProduct, Quote, Recipe} from './types.ts';
export type {DummyListOptions} from './types.ts';
export type {LoginRequest, AuthTokens, AuthUser} from './types.ts';
export type {NewProduct, ProductUpdate, Deleted, DummyError} from './types.ts';

export {DummyJsonApi, baseUrl} from './services.ts';
export type {DummyJsonOptions} from './services.ts';

/*
`HttpError` is re-exported so consumers can `instanceof`-check failures.
A non-2xx rejects with it; a transport failure rejects with fetch's own
TypeError, and an abort with a DOMException.
*/
export {HttpError} from '../core/index.ts';
export type {ClientOptions, RequestOptions, TypedResponse} from '../core/index.ts';
