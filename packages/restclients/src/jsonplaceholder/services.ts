import type {Post, Comment, Album, Photo, Todo, User} from './types.ts';
import type {NewPost, NewComment, NewAlbum, NewPhoto, NewTodo, NewUser} from './types.ts';
import type {ItemOptions, ListOptions} from './types.ts';
import {BaseApi} from '../core/index.ts';
import type {Query, ClientOptions, RequestOptions} from '../core/index.ts';

const baseUrl = 'https://jsonplaceholder.typicode.com';


/*
Translate the friendly option names into json-server's underscore params.

A bare number is still accepted for the list methods, because that is what
they took before options existed: `getPosts(5)` and `getPosts({limit: 5})`
are the same request.
*/
function listQuery(options?: number | ListOptions): Query
{
    const opts: ListOptions = typeof options === 'number' ? {limit: options} : options ?? {};

    return {
        _limit: opts.limit,
        _start: opts.start,
        _page: opts.page,
        _sort: opts.sort,
        _order: opts.order,
        _embed: opts.embed,
        _expand: opts.expand
    };
}


function itemQuery(options?: ItemOptions): Query
{
    return {
        _embed: options?.embed,
        _expand: options?.expand
    };
}


class JsonPlaceHolderApi extends BaseApi
{
    constructor(options: ClientOptions = {})
    {
        super({baseUrl}, options);
    }


    //Get Collections

    async getPosts(options?: number | ListOptions, config?: RequestOptions)
    {
        const url = '/posts';
        return this.httpGet<Array<Post>>(url, listQuery(options), config);
    }

    async getComments(options?: number | ListOptions, config?: RequestOptions)
    {
        const url = '/comments';
        return this.httpGet<Array<Comment>>(url, listQuery(options), config);
    }

    async getAlbums(options?: number | ListOptions, config?: RequestOptions)
    {
        const url = '/albums';
        return this.httpGet<Array<Album>>(url, listQuery(options), config);
    }

    async getPhotos(options?: number | ListOptions, config?: RequestOptions)
    {
        const url = '/photos';
        return this.httpGet<Array<Photo>>(url, listQuery(options), config);
    }

    async getTodos(options?: number | ListOptions, config?: RequestOptions)
    {
        const url = '/todos';
        return this.httpGet<Array<Todo>>(url, listQuery(options), config);
    }

    async getUsers(options?: number | ListOptions, config?: RequestOptions)
    {
        const url = '/users';
        return this.httpGet<Array<User>>(url, listQuery(options), config);
    }


    //Get One Item from REST API - get by id

    async getPost(id: number, options?: ItemOptions, config?: RequestOptions)
    {
        const url = `/posts/${id}`;
        return this.httpGet<Post>(url, itemQuery(options), config);
    }

    async getComment(id: number, options?: ItemOptions, config?: RequestOptions)
    {
        const url = `/comments/${id}`;
        return this.httpGet<Comment>(url, itemQuery(options), config);
    }

    async getAlbum(id: number, options?: ItemOptions, config?: RequestOptions)
    {
        const url = `/albums/${id}`;
        return this.httpGet<Album>(url, itemQuery(options), config);
    }

    async getPhoto(id: number, options?: ItemOptions, config?: RequestOptions)
    {
        const url = `/photos/${id}`;
        return this.httpGet<Photo>(url, itemQuery(options), config);
    }

    async getTodo(id: number, options?: ItemOptions, config?: RequestOptions)
    {
        const url = `/todos/${id}`;
        return this.httpGet<Todo>(url, itemQuery(options), config);
    }

    async getUser(id: number, options?: ItemOptions, config?: RequestOptions)
    {
        const url = `/users/${id}`;
        return this.httpGet<User>(url, itemQuery(options), config);
    }


    //Nested routes - the sub-collection belonging to one parent

    async getPostComments(postId: number, options?: number | ListOptions, config?: RequestOptions)
    {
        const url = `/posts/${postId}/comments`;
        return this.httpGet<Array<Comment>>(url, listQuery(options), config);
    }

    async getAlbumPhotos(albumId: number, options?: number | ListOptions, config?: RequestOptions)
    {
        const url = `/albums/${albumId}/photos`;
        return this.httpGet<Array<Photo>>(url, listQuery(options), config);
    }

    async getUserPosts(userId: number, options?: number | ListOptions, config?: RequestOptions)
    {
        const url = `/users/${userId}/posts`;
        return this.httpGet<Array<Post>>(url, listQuery(options), config);
    }

    async getUserAlbums(userId: number, options?: number | ListOptions, config?: RequestOptions)
    {
        const url = `/users/${userId}/albums`;
        return this.httpGet<Array<Album>>(url, listQuery(options), config);
    }

    async getUserTodos(userId: number, options?: number | ListOptions, config?: RequestOptions)
    {
        const url = `/users/${userId}/todos`;
        return this.httpGet<Array<Todo>>(url, listQuery(options), config);
    }


    //Get By - the same relationship expressed as a filter on the collection

    async getCommentsByPost(postid: number, config?: RequestOptions)
    {
        const url = '/comments';
        return this.httpGet<Array<Comment>>(url, {postId: postid}, config);
    }


    //Create

    async createPost(item: NewPost, config?: RequestOptions)
    {
        const url = '/posts';
        return this.httpSend<Post>('POST', url, item, config);
    }

    async createComment(item: NewComment, config?: RequestOptions)
    {
        const url = '/comments';
        return this.httpSend<Comment>('POST', url, item, config);
    }

    async createAlbum(item: NewAlbum, config?: RequestOptions)
    {
        const url = '/albums';
        return this.httpSend<Album>('POST', url, item, config);
    }

    async createPhoto(item: NewPhoto, config?: RequestOptions)
    {
        const url = '/photos';
        return this.httpSend<Photo>('POST', url, item, config);
    }

    async createTodo(item: NewTodo, config?: RequestOptions)
    {
        const url = '/todos';
        return this.httpSend<Todo>('POST', url, item, config);
    }

    async createUser(item: NewUser, config?: RequestOptions)
    {
        const url = '/users';
        return this.httpSend<User>('POST', url, item, config);
    }


    //Update - PUT replaces the whole item, id comes from the path

    async updatePost(id: number, item: NewPost, config?: RequestOptions)
    {
        const url = `/posts/${id}`;
        return this.httpSend<Post>('PUT', url, item, config);
    }

    async updateComment(id: number, item: NewComment, config?: RequestOptions)
    {
        const url = `/comments/${id}`;
        return this.httpSend<Comment>('PUT', url, item, config);
    }

    async updatePhoto(id: number, item: NewPhoto, config?: RequestOptions)
    {
        const url = `/photos/${id}`;
        return this.httpSend<Photo>('PUT', url, item, config);
    }

    async updateAlbum(id: number, item: NewAlbum, config?: RequestOptions)
    {
        const url = `/albums/${id}`;
        return this.httpSend<Album>('PUT', url, item, config);
    }

    async updateTodo(id: number, item: NewTodo, config?: RequestOptions)
    {
        const url = `/todos/${id}`;
        return this.httpSend<Todo>('PUT', url, item, config);
    }

    async updateUser(id: number, item: NewUser, config?: RequestOptions)
    {
        const url = `/users/${id}`;
        return this.httpSend<User>('PUT', url, item, config);
    }


    //Patch - partial update

    async patchPost(id: number, item: Partial<NewPost>, config?: RequestOptions)
    {
        const url = `/posts/${id}`;
        return this.httpSend<Post>('PATCH', url, item, config);
    }

    async patchComment(id: number, item: Partial<NewComment>, config?: RequestOptions)
    {
        const url = `/comments/${id}`;
        return this.httpSend<Comment>('PATCH', url, item, config);
    }

    async patchAlbum(id: number, item: Partial<NewAlbum>, config?: RequestOptions)
    {
        const url = `/albums/${id}`;
        return this.httpSend<Album>('PATCH', url, item, config);
    }

    async patchPhoto(id: number, item: Partial<NewPhoto>, config?: RequestOptions)
    {
        const url = `/photos/${id}`;
        return this.httpSend<Photo>('PATCH', url, item, config);
    }

    async patchTodo(id: number, item: Partial<NewTodo>, config?: RequestOptions)
    {
        const url = `/todos/${id}`;
        return this.httpSend<Todo>('PATCH', url, item, config);
    }

    async patchUser(id: number, item: Partial<NewUser>, config?: RequestOptions)
    {
        const url = `/users/${id}`;
        return this.httpSend<User>('PATCH', url, item, config);
    }


    //Delete

    async deletePost(id: number, config?: RequestOptions)
    {
        const url = `/posts/${id}`;
        return this.httpSend<Post>('DELETE', url, undefined, config);
    }

    async deleteComment(id: number, config?: RequestOptions)
    {
        const url = `/comments/${id}`;
        return this.httpSend<Comment>('DELETE', url, undefined, config);
    }

    async deleteAlbum(id: number, config?: RequestOptions)
    {
        const url = `/albums/${id}`;
        return this.httpSend<Album>('DELETE', url, undefined, config);
    }

    async deletePhoto(id: number, config?: RequestOptions)
    {
        const url = `/photos/${id}`;
        return this.httpSend<Photo>('DELETE', url, undefined, config);
    }

    async deleteTodo(id: number, config?: RequestOptions)
    {
        const url = `/todos/${id}`;
        return this.httpSend<Todo>('DELETE', url, undefined, config);
    }

    async deleteUser(id: number, config?: RequestOptions)
    {
        const url = `/users/${id}`;
        return this.httpSend<User>('DELETE', url, undefined, config);
    }

}

export {JsonPlaceHolderApi, baseUrl}
