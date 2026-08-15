import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {JsonPlaceHolderApi} from '../../src/jsonplaceholder/index.ts';
import type {NewPost, NewTodo} from '../../src/jsonplaceholder/index.ts';
import {mockFetch} from '../helpers/mock-fetch.ts';

const newPost: NewPost = {
    userId: 1,
    title: 'Comparing Floating-Point Numbers Is Tricky',
    body: 'https://bitbashing.io/comparing-floats.html'
};

const newTodo: NewTodo = {
    userId: 1,
    title: 'ship 2.0',
    completed: false
};


describe('jsonplaceholder create', () => {

    test('createPost POSTs the item to /posts', async () => {
        const {fetchImpl, only} = mockFetch({
            'POST /posts': {status: 201, data: {...newPost, id: 101}}
        });
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        const res = await api.createPost(newPost);
        const data = await res.json();

        assert.equal(only().method, 'POST');
        assert.equal(only().path, '/posts');
        assert.deepEqual(only().body, newPost);
        assert.equal(res.status, 201);
        assert.equal(data.id, 101);
    });


    test('create payloads do not carry an id', async () => {
        /*
        The server assigns the id; NewPost = Omit<Post, 'id'> keeps callers
        from inventing one. Confirm nothing sneaks an id into the body.
        */
        const {fetchImpl, only} = mockFetch({'POST /todos': {status: 201, data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.createTodo(newTodo);

        assert.ok(!Object.hasOwn(only().body as object, 'id'));
    });


    const creates = [
        {method: 'createComment', path: '/comments', item: {postId: 1, name: 'n', email: 'e@x.io', body: 'b'}},
        {method: 'createAlbum', path: '/albums', item: {userId: 1, title: 't'}},
        {method: 'createPhoto', path: '/photos', item: {albumId: 1, title: 't', url: 'u', thumbnailUrl: 'tu'}}
    ] as const;

    for (const {method, path, item} of creates) {
        test(`${method} POSTs to ${path}`, async () => {
            const {fetchImpl, only} = mockFetch({[`POST ${path}`]: {status: 201, data: {}}});
            const api = new JsonPlaceHolderApi({fetch: fetchImpl});

            // @ts-expect-error -- one shared loop over structurally distinct payloads
            await api[method](item);

            assert.equal(only().route, `POST ${path}`);
            assert.deepEqual(only().body, item);
        });
    }
});


describe('jsonplaceholder update', () => {

    test('updatePost PUTs to the id path with the item as body', async () => {
        const {fetchImpl, only} = mockFetch({
            'PUT /posts/1': {data: {...newPost, id: 1}}
        });
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        const res = await api.updatePost(1, newPost);
        const data = await res.json();

        assert.equal(only().method, 'PUT');
        assert.equal(only().path, '/posts/1');
        assert.deepEqual(only().body, newPost);
        assert.equal(data.id, 1);
    });


    test('updateTodo targets the right id', async () => {
        const {fetchImpl, only} = mockFetch({'PUT /todos/42': {data: {}}});
        const api = new JsonPlaceHolderApi({fetch: fetchImpl});

        await api.updateTodo(42, newTodo);

        assert.equal(only().path, '/todos/42');
    });
});


describe('jsonplaceholder delete', () => {

    const deletes = [
        {method: 'deletePost', path: '/posts/1'},
        {method: 'deleteComment', path: '/comments/1'},
        {method: 'deleteAlbum', path: '/albums/1'},
        {method: 'deletePhoto', path: '/photos/1'},
        {method: 'deleteTodo', path: '/todos/1'},
        {method: 'deleteUser', path: '/users/1'}
    ] as const;

    for (const {method, path} of deletes) {
        test(`${method}(1) DELETEs ${path}`, async () => {
            const {fetchImpl, only} = mockFetch({[`DELETE ${path}`]: {data: {}}});
            const api = new JsonPlaceHolderApi({fetch: fetchImpl});

            const res = await api[method](1);

            assert.equal(res.status, 200);
            assert.equal(only().method, 'DELETE');
            assert.equal(only().path, path);
            assert.equal(only().body, undefined);
        });
    }
});
