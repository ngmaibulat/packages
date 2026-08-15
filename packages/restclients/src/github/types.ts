/*
Entities as returned by https://api.github.com

GitHub's payloads are large and grow over time. Only the fields that are
stable and worth typing are listed; everything else is still there at
runtime, it just is not promised here.
*/


/* The abbreviated user object that appears inside almost every other payload. */
interface GithubUserRef {
    login: string,
    id: number,
    node_id: string,
    avatar_url: string,
    html_url: string,
    type: string,
    site_admin: boolean
}


interface GithubUser extends GithubUserRef {
    name: string | null,
    company: string | null,
    blog: string | null,
    location: string | null,
    email: string | null,
    bio: string | null,
    twitter_username?: string | null,
    public_repos: number,
    public_gists: number,
    followers: number,
    following: number,
    created_at: string,
    updated_at: string
}


interface GithubLicense {
    key: string,
    name: string,
    spdx_id: string | null,
    url: string | null
}


interface GithubRepo {
    id: number,
    node_id: string,
    name: string,
    full_name: string,
    private: boolean,
    owner: GithubUserRef,
    html_url: string,
    description: string | null,
    fork: boolean,
    created_at: string,
    updated_at: string,
    pushed_at: string | null,
    homepage: string | null,
    size: number,
    stargazers_count: number,
    watchers_count: number,
    language: string | null,
    forks_count: number,
    open_issues_count: number,
    license: GithubLicense | null,
    topics?: Array<string>,
    archived: boolean,
    disabled: boolean,
    default_branch: string
}


interface GithubLabel {
    id: number,
    name: string,
    color: string,
    description: string | null,
    default: boolean
}


/*
GitHub models pull requests as issues, so an issue with a `pull_request`
property is really a PR. That is why `getRepoIssues` returns both unless you
filter them out yourself.
*/
interface GithubIssue {
    id: number,
    node_id: string,
    number: number,
    title: string,
    user: GithubUserRef | null,
    state: 'open' | 'closed',
    locked: boolean,
    labels: Array<GithubLabel>,
    assignees: Array<GithubUserRef>,
    comments: number,
    created_at: string,
    updated_at: string,
    closed_at: string | null,
    body: string | null,
    html_url: string,
    pull_request?: {url: string, html_url: string}
}


interface GithubCommitAuthor {
    name: string,
    email: string,
    date: string
}


interface GithubCommit {
    sha: string,
    node_id: string,
    commit: {
        author: GithubCommitAuthor,
        committer: GithubCommitAuthor,
        message: string
    },
    html_url: string,
    author: GithubUserRef | null,
    committer: GithubUserRef | null
}


interface GithubContributor extends GithubUserRef {
    contributions: number
}


interface GithubRelease {
    id: number,
    tag_name: string,
    name: string | null,
    body: string | null,
    draft: boolean,
    prerelease: boolean,
    created_at: string,
    published_at: string | null,
    html_url: string,
    author: GithubUserRef,
    assets: Array<{id: number, name: string, size: number, download_count: number, browser_download_url: string}>
}


/* Contents API. The README arrives base64-encoded unless you ask for raw. */
interface GithubContent {
    type: string,
    encoding?: string,
    size: number,
    name: string,
    path: string,
    content?: string,
    sha: string,
    html_url: string | null,
    download_url: string | null
}


/* Search is the one family of endpoints that wraps its results. */
interface SearchResult<T> {
    total_count: number,
    incomplete_results: boolean,
    items: Array<T>
}


/*
Rate limit.

`/rate_limit` reports every resource bucket; `rateLimitOf(response)` reads the
same numbers off the headers of any response, which is cheaper because
`/rate_limit` is itself the only endpoint that does not count against you.
*/
interface RateLimitCore {
    limit: number,
    remaining: number,
    reset: number,
    used: number
}


interface RateLimitResponse {
    resources: Record<string, RateLimitCore>,
    rate: RateLimitCore
}


/* The header-derived view. `reset` is a Date; the headers carry unix seconds. */
interface RateLimit {
    limit: number | undefined,
    remaining: number | undefined,
    used: number | undefined,
    reset: Date | undefined
}


/*
The `Link` header, parsed. Absent relations are simply missing -- a
single-page response has no `next`, and GitHub sends no header at all.
*/
interface PageLinks {
    next?: string,
    prev?: string,
    first?: string,
    last?: string
}


/* Options shared by the paginated collection endpoints. */
interface GithubListOptions {
    perPage?: number,
    page?: number,
    sort?: string,
    direction?: 'asc' | 'desc'
}


interface RepoListOptions extends GithubListOptions {
    type?: 'all' | 'owner' | 'member',
    sort?: 'created' | 'updated' | 'pushed' | 'full_name'
}


interface IssueListOptions extends GithubListOptions {
    state?: 'open' | 'closed' | 'all',
    labels?: string | Array<string>,
    creator?: string,
    assignee?: string,
    since?: string,
    sort?: 'created' | 'updated' | 'comments'
}


/* The error body GitHub returns for a 404, a 403 rate-limit, or a bad query. */
interface GithubError {
    message: string,
    documentation_url?: string,
    status?: string,
    errors?: Array<{resource?: string, field?: string, code: string, message?: string}>
}


export type {GithubUser, GithubUserRef, GithubRepo, GithubLicense};
export type {GithubIssue, GithubLabel, GithubCommit, GithubCommitAuthor};
export type {GithubContributor, GithubRelease, GithubContent};
export type {SearchResult, RateLimitCore, RateLimitResponse, RateLimit, PageLinks};
export type {GithubListOptions, RepoListOptions, IssueListOptions, GithubError};
