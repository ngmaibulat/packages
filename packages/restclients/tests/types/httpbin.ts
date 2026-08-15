/*
Compile-time assertions for the httpbin client. See ./jsonplaceholder.ts
for why these files exist.
*/

import type {TypedResponse} from '../../src/core/index.ts';

import {HttpbinApi} from '../../src/httpbin/index.ts';
import type {HttpbinEcho, HttpbinOrigin, HttpbinUuid, HttpbinAuth} from '../../src/httpbin/index.ts';

const hb = new HttpbinApi();


//The echo verbs all resolve to the same envelope

const _get: Promise<TypedResponse<HttpbinEcho>> = hb.get();
const _post: Promise<TypedResponse<HttpbinEcho>> = hb.post({a: 1});
const _delay: Promise<TypedResponse<HttpbinEcho>> = hb.delay(3);

// @ts-expect-error -- /ip returns only an origin, not the full echo
const _ipIsNotAnEcho: Promise<TypedResponse<HttpbinEcho>> = hb.ip();


//The narrow endpoints have narrow types

const _ip: Promise<TypedResponse<HttpbinOrigin>> = hb.ip();
const _uuid: Promise<TypedResponse<HttpbinUuid>> = hb.uuid();
const _auth: Promise<TypedResponse<HttpbinAuth>> = hb.bearer('token');


//get() takes query params, including arrays

hb.get({a: 1, b: 'two', c: ['x', 'y'], d: true});

// @ts-expect-error -- a nested object is not a query value
hb.get({a: {b: 1}});


//Pointing at Postman Echo or a self-hosted instance is just a base URL

const _echoInstance = new HttpbinApi({baseUrl: 'https://postman-echo.com'});


export type {};
