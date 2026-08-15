/*
Entities as returned by https://jsonplaceholder.typicode.com
Every entity carries a server-assigned `id`.
*/

interface Post {
    userId: number,
    id: number,
    title: string,
    body: string
}

interface Comment {
    postId: number,
    id: number,
    name: string,
    email: string,
    body: string
}

interface Album {
    userId: number,
    id: number,
    title: string
}

interface Photo {
    albumId: number,
    id: number,
    title: string,
    url: string,
    thumbnailUrl: string
}


interface Todo {
    userId: number,
    id: number,
    title: string,
    completed: boolean
}


interface Geo {
    lat: number,
    lng: number
}


interface Address {
    street: string,
    suite: string,
    city: string,
    zipcode: string,
    geo: Geo
}


interface Company {
    name: string,
    catchPhrase: string,
    bs: string
}


interface User {
    id: number,
    name: string,
    username: string,
    email: string,
    address: Address,
    phone:  string,
    website: string,
    company: Company
}


/*
Input shapes for create/update.

The server assigns `id`, so callers should not have to invent one.
On update the id travels in the URL path, not the body.
*/

type NewPost = Omit<Post, 'id'>;
type NewComment = Omit<Comment, 'id'>;
type NewAlbum = Omit<Album, 'id'>;
type NewPhoto = Omit<Photo, 'id'>;
type NewTodo = Omit<Todo, 'id'>;
type NewUser = Omit<User, 'id'>;


/*
Query options.

jsonplaceholder is json-server, so every collection accepts the same
`_limit` / `_start` / `_page` / `_sort` / `_order` family, and both
collections and single items accept `_embed` / `_expand`.

`embed` and `expand` are single strings on purpose: json-server reads a
repeated `?_embed=a&_embed=b`, and the shared params helper comma-joins
arrays instead. Pass a per-request config if you need more than one.

Note that embedded or expanded fields are not reflected in the return type --
`getPost(1, {embed: 'comments'})` still resolves to a `Post`.
*/

interface ItemOptions {
    embed?: string,
    expand?: string
}

interface ListOptions extends ItemOptions {
    limit?: number,
    start?: number,
    page?: number,
    sort?: string,
    order?: 'asc' | 'desc'
}


export type {Post, Comment, Album, Photo, Todo, User};
export type {Geo, Address, Company};
export type {NewPost, NewComment, NewAlbum, NewPhoto, NewTodo, NewUser};
export type {ItemOptions, ListOptions};
