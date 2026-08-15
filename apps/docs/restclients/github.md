# `@aibulat/restclients/github`

[api.github.com](https://docs.github.com/rest) — users, repositories, issues,
commits, releases and search.

```js
import {GithubApi, rateLimitOf, linksOf} from '@aibulat/restclients/github';

const api = new GithubApi();
const res = await api.getRepo('axios', 'axios');

console.log((await res.json()).stargazers_count);
```

---

## Tokens and rate limits

Everything here works unauthenticated, but GitHub allows only **60 requests an
hour per IP** that way, against 5000 with a token:

```js
const api = new GithubApi({token: process.env.GITHUB_TOKEN});
```

> **Do not ship a token in a browser bundle.** Anything you send to the browser
> is public, and a leaked personal access token is a leaked account. If a
> browser needs GitHub data, proxy it through something you control.

Search has its own much lower limit — 10 requests a minute unauthenticated, 30
with a token — and counts separately from everything else.

The client sends `Accept: application/vnd.github+json` and
`X-GitHub-Api-Version: 2022-11-28` on every request. Override the version with
the `version` option, or the media type per request:

```js
// The README as a raw file rather than a base64 envelope
await api.getReadme('axios', 'axios', {headers: {Accept: 'application/vnd.github.raw'}});
```

---

## Methods

```ts
getUser(username, config?)
getAuthenticatedUser(config?)              // needs a token
getUserRepos(username, options?, config?)
getUserFollowers(username, options?, config?)

getRepo(owner, repo, config?)
getRepoCommits(owner, repo, options?, config?)
getRepoContributors(owner, repo, options?, config?)
getRepoLanguages(owner, repo, config?)     // -> Record<string, number> of byte counts
getReadme(owner, repo, config?)

getRepoIssues(owner, repo, options?, config?)
getIssue(owner, repo, issueNumber, config?)

getReleases(owner, repo, options?, config?)
getLatestRelease(owner, repo, config?)     // 404s if there is no non-draft release

searchRepositories(q, options?, config?)
searchUsers(q, options?, config?)
searchIssues(q, options?, config?)

getRateLimit(config?)                      // the one endpoint that does not count against you
getPage<T>(url, config?)                   // follow an absolute URL from linksOf()
```

List options use friendly names that map to GitHub's wire params:

```ts
interface GithubListOptions {
    perPage?: number,    // per_page
    page?: number,
    sort?: string,
    direction?: 'asc' | 'desc'
}
```

`RepoListOptions` adds `type` and narrows `sort`; `IssueListOptions` adds
`state`, `labels` (an array is comma-joined), `creator`, `assignee` and
`since`.

---

## Pagination and rate limits live in headers

Neither is in the body, which is why every method returns the whole `Response`
and these are functions over it rather than more methods:

```ts
parseLink(header?: string | null): PageLinks
linksOf(response: Response): PageLinks
rateLimitOf(response: Response): RateLimit
```

`getPage()` follows one of those absolute URLs through the client, so your
token and the media-type headers come along:

```js
let res = await api.getRepoIssues('axios', 'axios', {perPage: 100});
const all = [...await res.json()];

let links = linksOf(res);
while (links.next) {
    res = await api.getPage(links.next);
    all.push(...await res.json());
    links = linksOf(res);
}
```

GitHub sends no `Link` header at all for a single-page result, and drops
`next` and `last` once you reach the final page — so an absent key means
"there is no such page" and the loop above terminates.

```ts
interface PageLinks {next?: string, prev?: string, first?: string, last?: string}

interface RateLimit {
    limit: number | undefined,
    remaining: number | undefined,
    used: number | undefined,
    reset: Date | undefined      // converted from the unix seconds in the header
}
```

Every field is independently optional, because a response that has been
through a proxy may have lost some of them.

An exhausted budget is a **403 whose `remaining` is 0** — that is how you tell
it apart from a permissions failure:

```js
catch (err) {
    if (err instanceof HttpError && err.status === 403) {
        const {remaining, reset} = rateLimitOf(err.response);
        if (remaining === 0) {
            console.error('rate limited until', reset);
        }
    }
}
```

---

## Types

`GithubUser`, `GithubUserRef` (the abbreviated form nested in other payloads),
`GithubRepo`, `GithubIssue`, `GithubCommit`, `GithubContributor`,
`GithubRelease`, `GithubContent`, plus `GithubLabel`, `GithubLicense` and
`GithubCommitAuthor`.

Search wraps its results — `searchRepositories` resolves to
`SearchResult<GithubRepo>` with `{total_count, incomplete_results, items}`,
where the collection endpoints return bare arrays.

Errors are `GithubError`: `{message, documentation_url?, errors?}`.

GitHub's payloads are large and grow over time, so only the stable fields are
typed. Everything else is still there at runtime.

**Pull requests are issues.** `getRepoIssues` returns both; a row with a
`pull_request` property is a PR. Filter them out yourself if you only want
issues.
