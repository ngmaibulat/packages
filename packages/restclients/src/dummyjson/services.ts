import type {DummyPage, Product, Category, DummyUser} from './types.ts';
import type {DummyPost, DummyComment, DummyTodo, Cart, Quote, Recipe} from './types.ts';
import type {DummyListOptions, LoginRequest, AuthTokens, AuthUser} from './types.ts';
import type {NewProduct, ProductUpdate, Deleted} from './types.ts';
import {BaseApi, encodeSegment} from '../core/index.ts';
import type {Query, ClientOptions, RequestOptions} from '../core/index.ts';

const baseUrl = 'https://dummyjson.com';

interface DummyJsonOptions extends ClientOptions {
    /*
    Sent as `Authorization: Bearer <token>`. Only `me()` needs one; get it
    from `login()`, or set it later with `setToken()`.
    */
    token?: string
}


/*
`select` may be given as an array -- the shared params helper comma-joins it,
which is the form dummyjson expects (`?select=title,price`).
*/
function listQuery(options?: DummyListOptions): Query
{
    return {
        limit: options?.limit,
        skip: options?.skip,
        select: options?.select,
        sortBy: options?.sortBy,
        order: options?.order
    };
}


class DummyJsonApi extends BaseApi
{
    constructor(options: DummyJsonOptions = {})
    {
        const {token, ...config} = options;

        /*
        `config`, not `options`: `token` is not a `ClientOptions` key, so
        passing `options` whole landed it in the base class's rest parameter
        and from there into the init of every `fetch` call -- which is the
        object a consumer's own `fetch` wrapper is handed.
        */
        super({baseUrl}, config);

        /*
        Routed through setToken rather than the constructor headers, so that
        a token set here and a token set later live in the same place and
        `setToken()` can clear either of them.
        */
        if (token) {
            this.setToken(token);
        }
    }

    /*
    Attach (or clear) the bearer token for every subsequent request.

    The login -> authenticated-call flow needs this, because the token only
    exists after the first call has already returned:

        const res = await api.login({username: 'emilys', password: 'emilyspass'});
        api.setToken((await res.json()).accessToken);
        await api.me();
    */
    setToken(token?: string): void
    {
        if (token) {
            this.defaultHeaders.set('Authorization', `Bearer ${token}`);
        }
        else {
            this.defaultHeaders.delete('Authorization');
        }
    }


    //Products

    async getProducts(options?: DummyListOptions, config?: RequestOptions)
    {
        const url = '/products';
        return this.httpGet<DummyPage<'products', Product>>(url, listQuery(options), config);
    }

    async getProduct(id: number, config?: RequestOptions)
    {
        const url = `/products/${id}`;
        return this.httpGet<Product>(url, undefined, config);
    }

    async searchProducts(q: string, options?: DummyListOptions, config?: RequestOptions)
    {
        const url = '/products/search';
        return this.httpGet<DummyPage<'products', Product>>(url, {q, ...listQuery(options)}, config);
    }

    /* Full category objects; `getProductCategoryList` returns bare slugs. */
    async getProductCategories(config?: RequestOptions)
    {
        const url = '/products/categories';
        return this.httpGet<Array<Category>>(url, undefined, config);
    }

    async getProductCategoryList(config?: RequestOptions)
    {
        const url = '/products/category-list';
        return this.httpGet<Array<string>>(url, undefined, config);
    }

    async getProductsByCategory(slug: string, options?: DummyListOptions, config?: RequestOptions)
    {
        const url = `/products/category/${encodeSegment(slug)}`;
        return this.httpGet<DummyPage<'products', Product>>(url, listQuery(options), config);
    }


    //Product writes - simulated upstream, nothing is persisted

    async addProduct(item: NewProduct, config?: RequestOptions)
    {
        const url = '/products/add';
        return this.httpSend<Product>('POST', url, item, config);
    }

    async updateProduct(id: number, item: ProductUpdate, config?: RequestOptions)
    {
        const url = `/products/${id}`;
        return this.httpSend<Product>('PUT', url, item, config);
    }

    async patchProduct(id: number, item: ProductUpdate, config?: RequestOptions)
    {
        const url = `/products/${id}`;
        return this.httpSend<Product>('PATCH', url, item, config);
    }

    async deleteProduct(id: number, config?: RequestOptions)
    {
        const url = `/products/${id}`;
        return this.httpSend<Product & Deleted>('DELETE', url, undefined, config);
    }


    //Users

    async getUsers(options?: DummyListOptions, config?: RequestOptions)
    {
        const url = '/users';
        return this.httpGet<DummyPage<'users', DummyUser>>(url, listQuery(options), config);
    }

    async getUser(id: number, config?: RequestOptions)
    {
        const url = `/users/${id}`;
        return this.httpGet<DummyUser>(url, undefined, config);
    }

    async searchUsers(q: string, options?: DummyListOptions, config?: RequestOptions)
    {
        const url = '/users/search';
        return this.httpGet<DummyPage<'users', DummyUser>>(url, {q, ...listQuery(options)}, config);
    }

    async getUserCarts(userId: number, config?: RequestOptions)
    {
        const url = `/users/${userId}/carts`;
        return this.httpGet<DummyPage<'carts', Cart>>(url, undefined, config);
    }

    async getUserPosts(userId: number, options?: DummyListOptions, config?: RequestOptions)
    {
        const url = `/users/${userId}/posts`;
        return this.httpGet<DummyPage<'posts', DummyPost>>(url, listQuery(options), config);
    }

    async getUserTodos(userId: number, options?: DummyListOptions, config?: RequestOptions)
    {
        const url = `/users/${userId}/todos`;
        return this.httpGet<DummyPage<'todos', DummyTodo>>(url, listQuery(options), config);
    }


    //Posts and comments

    async getPosts(options?: DummyListOptions, config?: RequestOptions)
    {
        const url = '/posts';
        return this.httpGet<DummyPage<'posts', DummyPost>>(url, listQuery(options), config);
    }

    async getPost(id: number, config?: RequestOptions)
    {
        const url = `/posts/${id}`;
        return this.httpGet<DummyPost>(url, undefined, config);
    }

    async searchPosts(q: string, options?: DummyListOptions, config?: RequestOptions)
    {
        const url = '/posts/search';
        return this.httpGet<DummyPage<'posts', DummyPost>>(url, {q, ...listQuery(options)}, config);
    }

    async getPostsByTag(tag: string, options?: DummyListOptions, config?: RequestOptions)
    {
        const url = `/posts/tag/${encodeSegment(tag)}`;
        return this.httpGet<DummyPage<'posts', DummyPost>>(url, listQuery(options), config);
    }

    async getPostComments(postId: number, options?: DummyListOptions, config?: RequestOptions)
    {
        const url = `/posts/${postId}/comments`;
        return this.httpGet<DummyPage<'comments', DummyComment>>(url, listQuery(options), config);
    }

    async getComments(options?: DummyListOptions, config?: RequestOptions)
    {
        const url = '/comments';
        return this.httpGet<DummyPage<'comments', DummyComment>>(url, listQuery(options), config);
    }

    async getComment(id: number, config?: RequestOptions)
    {
        const url = `/comments/${id}`;
        return this.httpGet<DummyComment>(url, undefined, config);
    }


    //Todos

    async getTodos(options?: DummyListOptions, config?: RequestOptions)
    {
        const url = '/todos';
        return this.httpGet<DummyPage<'todos', DummyTodo>>(url, listQuery(options), config);
    }

    async getTodo(id: number, config?: RequestOptions)
    {
        const url = `/todos/${id}`;
        return this.httpGet<DummyTodo>(url, undefined, config);
    }

    async getRandomTodo(config?: RequestOptions)
    {
        const url = '/todos/random';
        return this.httpGet<DummyTodo>(url, undefined, config);
    }


    //Carts

    async getCarts(options?: DummyListOptions, config?: RequestOptions)
    {
        const url = '/carts';
        return this.httpGet<DummyPage<'carts', Cart>>(url, listQuery(options), config);
    }

    async getCart(id: number, config?: RequestOptions)
    {
        const url = `/carts/${id}`;
        return this.httpGet<Cart>(url, undefined, config);
    }


    //Quotes

    async getQuotes(options?: DummyListOptions, config?: RequestOptions)
    {
        const url = '/quotes';
        return this.httpGet<DummyPage<'quotes', Quote>>(url, listQuery(options), config);
    }

    async getQuote(id: number, config?: RequestOptions)
    {
        const url = `/quotes/${id}`;
        return this.httpGet<Quote>(url, undefined, config);
    }

    async getRandomQuote(config?: RequestOptions)
    {
        const url = '/quotes/random';
        return this.httpGet<Quote>(url, undefined, config);
    }


    //Recipes

    async getRecipes(options?: DummyListOptions, config?: RequestOptions)
    {
        const url = '/recipes';
        return this.httpGet<DummyPage<'recipes', Recipe>>(url, listQuery(options), config);
    }

    async getRecipe(id: number, config?: RequestOptions)
    {
        const url = `/recipes/${id}`;
        return this.httpGet<Recipe>(url, undefined, config);
    }

    async searchRecipes(q: string, options?: DummyListOptions, config?: RequestOptions)
    {
        const url = '/recipes/search';
        return this.httpGet<DummyPage<'recipes', Recipe>>(url, {q, ...listQuery(options)}, config);
    }

    async getRecipesByTag(tag: string, options?: DummyListOptions, config?: RequestOptions)
    {
        const url = `/recipes/tag/${encodeSegment(tag)}`;
        return this.httpGet<DummyPage<'recipes', Recipe>>(url, listQuery(options), config);
    }

    async getRecipesByMealType(mealType: string, options?: DummyListOptions, config?: RequestOptions)
    {
        const url = `/recipes/meal-type/${encodeSegment(mealType)}`;
        return this.httpGet<DummyPage<'recipes', Recipe>>(url, listQuery(options), config);
    }


    //Auth - the demo credentials are any user's `username` plus `password`
    //from https://dummyjson.com/users (e.g. emilys / emilyspass)

    async login(credentials: LoginRequest, config?: RequestOptions)
    {
        const url = '/auth/login';
        return this.httpSend<AuthUser>('POST', url, credentials, config);
    }

    /* Requires a bearer token -- see `setToken`. */
    async me(config?: RequestOptions)
    {
        const url = '/auth/me';
        return this.httpGet<DummyUser>(url, undefined, config);
    }

    async refresh(refreshToken: string, expiresInMins?: number, config?: RequestOptions)
    {
        const url = '/auth/refresh';
        return this.httpSend<AuthTokens>('POST', url, {refreshToken, expiresInMins}, config);
    }

}

export {DummyJsonApi, baseUrl}
export type {DummyJsonOptions}
