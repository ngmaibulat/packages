import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {JsonPlaceHolderApi} from '../../src/jsonplaceholder/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

const endpoints = [
    {method: 'getPost', path: '/posts/1'},
    {method: 'getComment', path: '/comments/1'},
    {method: 'getAlbum', path: '/albums/1'},
    {method: 'getPhoto', path: '/photos/1'},
    {method: 'getTodo', path: '/todos/1'},
    {method: 'getUser', path: '/users/1'}
] as const;


describe('jsonplaceholder get-one endpoints', () => {

    for (const {method, path} of endpoints) {

        test(`${method}(1) requests ${path}`, async () => {
            const {fetchImpl, only} = mockFetch({[`GET ${path}`]: {data: {id: 1}}});
            const api = new JsonPlaceHolderApi({fetch: fetchImpl});

            const res = await api[method](1);

            assert.equal(res.status, 200);
            assert.equal(only().method, 'GET');
            assert.equal(only().path, path);
        });
    }


    test('getUser returns the user body, not a post', async () => {
        /*
        getUser was declared `get<Post>` for a long time. The generic is
        invisible at runtime, so this asserts the payload reaches the caller
        intact -- tests/types.ts guards the declared type.
        */
        const user = {
            id: 1,
            name: 'Leanne Graham',
            username: 'Bret',
            email: 'Sincere@april.biz',
            address: {
                street: 'Kulas Light',
                suite: 'Apt. 556',
                city: 'Gwenborough',
                zipcode: '92998-3874',
                geo: {lat: -37.3159, lng: 81.1496}
            },
            phone: '1-770-736-8031 x56442',
            website: 'hildegard.org',
            company: {
                name: 'Romaguera-Crona',
                catchPhrase: 'Multi-layered client-server neural-net',
                bs: 'harness real-time e-markets'
            }
        };

        const {fetchImpl} = mockFetch({'GET /users/1': {data: user}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        const res = await api.getUser(1);
        const data = await res.json();

        assert.equal(data.username, 'Bret');
        assert.equal(data.company.name, 'Romaguera-Crona');
        assert.equal(data.address.geo.lat, -37.3159);
    });


    test('getCommentsByPost filters with a postId param, not a hand-built query string', async () => {
        const {fetchImpl, only} = mockFetch({'GET /comments': {data: []}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.getCommentsByPost(7);

        assert.equal(only().path, '/comments');
        assert.deepEqual(only().params, {postId: '7'});
    });
});
