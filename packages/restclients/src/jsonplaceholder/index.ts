export type {Post, Comment, Album, Photo, Todo, User} from './types.ts';
export type {Geo, Address, Company} from './types.ts';
export type {NewPost, NewComment, NewAlbum, NewPhoto, NewTodo, NewUser} from './types.ts';
export type {ItemOptions, ListOptions} from './types.ts';

export {JsonPlaceHolderApi, baseUrl} from './services.ts';

/*
`HttpError` is re-exported so consumers can `instanceof`-check failures.
A non-2xx rejects with it; a transport failure rejects with fetch's own
TypeError, and an abort with a DOMException.
*/
export {HttpError} from '../core/index.ts';
export type {ClientOptions, RequestOptions, TypedResponse} from '../core/index.ts';
