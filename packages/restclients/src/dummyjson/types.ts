/*
Entities as returned by https://dummyjson.com

dummyjson is the closest thing to a modern jsonplaceholder: same "nothing is
persisted" contract, but with richer entities, real list/search params and a
working JWT flow.

Only the fields dummyjson actually documents are typed. Several endpoints
return extra keys that upstream adds and removes without notice, so entities
are typed as what you can rely on rather than as a full snapshot.
*/


/*
Every collection response shares three counters and one array whose key is the
resource name -- `{products: [...]}`, `{users: [...]}`, and so on. The key is a
type parameter so `getProducts()` resolves to something with a `products`
property, not a generic `data`.
*/
type DummyPage<K extends string, T> = {
    total: number,
    skip: number,
    limit: number
} & {
    [P in K]: Array<T>
};


interface Dimensions {
    width: number,
    depth: number,
    height: number
}


interface Review {
    rating: number,
    comment: string,
    date: string,
    reviewerName: string,
    reviewerEmail: string
}


interface ProductMeta {
    createdAt: string,
    updatedAt: string,
    barcode: string,
    qrCode: string
}


interface Product {
    id: number,
    title: string,
    description: string,
    category: string,
    price: number,
    discountPercentage: number,
    rating: number,
    stock: number,
    tags: Array<string>,
    brand?: string,
    sku: string,
    weight: number,
    dimensions: Dimensions,
    warrantyInformation: string,
    shippingInformation: string,
    availabilityStatus: string,
    reviews: Array<Review>,
    returnPolicy: string,
    minimumOrderQuantity: number,
    meta: ProductMeta,
    images: Array<string>,
    thumbnail: string
}


interface Category {
    slug: string,
    name: string,
    url: string
}


interface DummyAddress {
    address: string,
    city: string,
    state: string,
    stateCode: string,
    postalCode: string,
    country: string,
    coordinates: {lat: number, lng: number}
}


interface DummyCompany {
    department: string,
    name: string,
    title: string,
    address: DummyAddress
}


interface DummyUser {
    id: number,
    firstName: string,
    lastName: string,
    maidenName: string,
    age: number,
    gender: string,
    email: string,
    phone: string,
    username: string,
    birthDate: string,
    image: string,
    bloodGroup: string,
    height: number,
    weight: number,
    eyeColor: string,
    address: DummyAddress,
    company: DummyCompany,
    role: string
}


interface Reactions {
    likes: number,
    dislikes: number
}


interface DummyPost {
    id: number,
    title: string,
    body: string,
    tags: Array<string>,
    reactions: Reactions,
    views: number,
    userId: number
}


interface DummyComment {
    id: number,
    body: string,
    postId: number,
    likes: number,
    user: {id: number, username: string, fullName: string}
}


interface DummyTodo {
    id: number,
    todo: string,
    completed: boolean,
    userId: number
}


interface CartProduct {
    id: number,
    title: string,
    price: number,
    quantity: number,
    total: number,
    discountPercentage: number,
    discountedTotal: number,
    thumbnail: string
}


interface Cart {
    id: number,
    products: Array<CartProduct>,
    total: number,
    discountedTotal: number,
    userId: number,
    totalProducts: number,
    totalQuantity: number
}


interface Quote {
    id: number,
    quote: string,
    author: string
}


interface Recipe {
    id: number,
    name: string,
    ingredients: Array<string>,
    instructions: Array<string>,
    prepTimeMinutes: number,
    cookTimeMinutes: number,
    servings: number,
    difficulty: string,
    cuisine: string,
    caloriesPerServing: number,
    tags: Array<string>,
    userId: number,
    image: string,
    rating: number,
    reviewCount: number,
    mealType: Array<string>
}


/*
List options.

`select` is comma-joined by the shared params helper, which is the form
dummyjson expects: `?select=title,price`.
*/
interface DummyListOptions {
    limit?: number,
    skip?: number,
    select?: string | Array<string>,
    sortBy?: string,
    order?: 'asc' | 'desc'
}


/*
Auth.

`login` mints a short-lived access token; `expiresInMins` (default 60) is
accepted by both login and refresh. The token flows as a Bearer header --
`me()` is the only call that requires one.
*/

interface LoginRequest {
    username: string,
    password: string,
    expiresInMins?: number
}


interface AuthTokens {
    accessToken: string,
    refreshToken: string
}


/* login returns the user record with the two tokens spliced in. */
type AuthUser = DummyUser & AuthTokens;


/*
Write payloads.

dummyjson simulates writes: the response echoes what you sent with an id
attached, and nothing is stored. `addProduct` accepts any subset of a product.
*/
type NewProduct = Partial<Omit<Product, 'id'>> & {title: string};

type ProductUpdate = Partial<Omit<Product, 'id'>>;


/* Returned by every DELETE. */
interface Deleted {
    isDeleted: boolean,
    deletedOn: string
}


/* The error body dummyjson returns for a bad id or bad credentials. */
interface DummyError {
    message: string,
    name?: string
}


export type {DummyPage};
export type {Product, Category, Dimensions, Review, ProductMeta};
export type {DummyUser, DummyAddress, DummyCompany};
export type {DummyPost, DummyComment, DummyTodo, Reactions};
export type {Cart, CartProduct, Quote, Recipe};
export type {DummyListOptions};
export type {LoginRequest, AuthTokens, AuthUser};
export type {NewProduct, ProductUpdate, Deleted, DummyError};
