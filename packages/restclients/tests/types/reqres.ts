/*
Compile-time assertions for the reqres client. See ./jsonplaceholder.ts
for why these files exist.
*/

import type {TypedResponse} from '../../src/core/index.ts';

import {ReqresApi} from '../../src/reqres/index.ts';
import type {ReqresUser, ReqresResource, Paginated, Single} from '../../src/reqres/index.ts';
import type {User} from '../../src/jsonplaceholder/index.ts';

const rq = new ReqresApi();


//Every payload arrives inside an envelope

const _page: Promise<TypedResponse<Paginated<ReqresUser>>> = rq.getUsers(2);
const _one: Promise<TypedResponse<Single<ReqresUser>>> = rq.getUser(2);
const _resources: Promise<TypedResponse<Paginated<ReqresResource>>> = rq.getResources();
const _resource: Promise<TypedResponse<Single<ReqresResource>>> = rq.getResource(2);

// @ts-expect-error -- a paginated envelope is not a bare array
const _bare: Promise<TypedResponse<Array<ReqresUser>>> = rq.getUsers();

// @ts-expect-error -- reqres users are not jsonplaceholder users
const _mixed: Promise<TypedResponse<Single<User>>> = rq.getUser(2);


//Writes echo back synthesised shapes, not the entity

const _created = rq.createUser({name: 'morpheus', job: 'leader'});
const _patched = rq.patchUser(2, {job: 'zion resident'});

// @ts-expect-error -- put replaces the whole item
rq.updateUser(2, {job: 'zion resident'});


//The api key is an option alongside the request defaults

const _keyed = new ReqresApi({apiKey: 'my-key', timeout: 1000});

// @ts-expect-error -- unknown options are rejected
new ReqresApi({apiKeys: 'my-key'});


export type {};
