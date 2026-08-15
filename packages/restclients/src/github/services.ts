import type {GithubUser, GithubRepo, GithubIssue, GithubCommit} from './types.ts';
import type {GithubContributor, GithubRelease, GithubContent} from './types.ts';
import type {SearchResult, RateLimitResponse} from './types.ts';
import type {GithubListOptions, RepoListOptions, IssueListOptions} from './types.ts';
import {BaseApi, encodeSegment} from '../core/index.ts';
import type {Query, ClientOptions, RequestOptions} from '../core/index.ts';

const baseUrl = 'https://api.github.com';

/*
The media type GitHub asks every client to send, plus the API version it
pins the response shape to. Both are overridable per request -- asking for
`application/vnd.github.raw` on a contents call gets you the file itself
rather than a base64 envelope.
*/
const acceptHeader = 'application/vnd.github+json';
const apiVersion = '2022-11-28';

interface GithubOptions extends ClientOptions {
    /*
    A personal access token, sent as `Authorization: Bearer <token>`.

    Optional: everything here works unauthenticated, but GitHub allows only
    60 requests an hour per IP that way, against 5000 with a token.

    Do not ship a token in a browser bundle -- anything you send to the
    browser is public, and a leaked token is a leaked account.
    */
    token?: string,
    /* Overrides the pinned API version. Rarely needed. */
    version?: string
}


function listQuery(options?: GithubListOptions): Query
{
    return {
        per_page: options?.perPage,
        page: options?.page,
        sort: options?.sort,
        direction: options?.direction
    };
}


class GithubApi extends BaseApi
{
    constructor(options: GithubOptions = {})
    {
        const {token, version = apiVersion, ...config} = options;

        const headers: Record<string, string> = {
            Accept: acceptHeader,
            'X-GitHub-Api-Version': version
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        super({baseUrl, headers}, config);
    }


    //Users

    async getUser(username: string, config?: RequestOptions)
    {
        const url = `/users/${encodeSegment(username)}`;
        return this.httpGet<GithubUser>(url, undefined, config);
    }

    /* Requires a token -- 401 without one. */
    async getAuthenticatedUser(config?: RequestOptions)
    {
        const url = '/user';
        return this.httpGet<GithubUser>(url, undefined, config);
    }

    async getUserRepos(username: string, options?: RepoListOptions, config?: RequestOptions)
    {
        const url = `/users/${encodeSegment(username)}/repos`;
        return this.httpGet<Array<GithubRepo>>(url, {...listQuery(options), type: options?.type}, config);
    }

    async getUserFollowers(username: string, options?: GithubListOptions, config?: RequestOptions)
    {
        const url = `/users/${encodeSegment(username)}/followers`;
        return this.httpGet<Array<GithubUser>>(url, listQuery(options), config);
    }


    //Repositories

    async getRepo(owner: string, repo: string, config?: RequestOptions)
    {
        const url = `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}`;
        return this.httpGet<GithubRepo>(url, undefined, config);
    }

    async getRepoCommits(owner: string, repo: string, options?: GithubListOptions, config?: RequestOptions)
    {
        const url = `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/commits`;
        return this.httpGet<Array<GithubCommit>>(url, listQuery(options), config);
    }

    async getRepoContributors(owner: string, repo: string, options?: GithubListOptions, config?: RequestOptions)
    {
        const url = `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/contributors`;
        return this.httpGet<Array<GithubContributor>>(url, listQuery(options), config);
    }

    async getRepoLanguages(owner: string, repo: string, config?: RequestOptions)
    {
        const url = `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/languages`;
        return this.httpGet<Record<string, number>>(url, undefined, config);
    }

    /*
    The README as a contents envelope -- `content` is base64. For the raw file,
    ask for the raw media type:

        api.getReadme('owner', 'repo', {headers: {Accept: 'application/vnd.github.raw'}})
    */
    async getReadme(owner: string, repo: string, config?: RequestOptions)
    {
        const url = `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/readme`;
        return this.httpGet<GithubContent>(url, undefined, config);
    }


    //Issues - GitHub models pull requests as issues, so these lists include
    //PRs unless you filter on the `pull_request` property yourself.

    async getRepoIssues(owner: string, repo: string, options?: IssueListOptions, config?: RequestOptions)
    {
        const url = `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/issues`;
        return this.httpGet<Array<GithubIssue>>(url, {
            ...listQuery(options),
            state: options?.state,
            labels: options?.labels,
            creator: options?.creator,
            assignee: options?.assignee,
            since: options?.since
        }, config);
    }

    async getIssue(owner: string, repo: string, issueNumber: number, config?: RequestOptions)
    {
        const url = `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/issues/${issueNumber}`;
        return this.httpGet<GithubIssue>(url, undefined, config);
    }


    //Releases

    async getReleases(owner: string, repo: string, options?: GithubListOptions, config?: RequestOptions)
    {
        const url = `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/releases`;
        return this.httpGet<Array<GithubRelease>>(url, listQuery(options), config);
    }

    /* 404s when the repo has no non-draft, non-prerelease release. */
    async getLatestRelease(owner: string, repo: string, config?: RequestOptions)
    {
        const url = `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/releases/latest`;
        return this.httpGet<GithubRelease>(url, undefined, config);
    }


    //Search - the one family that wraps its results, and the one with its own
    //much lower rate limit (10/min unauthenticated, 30/min with a token).

    async searchRepositories(q: string, options?: GithubListOptions, config?: RequestOptions)
    {
        const url = '/search/repositories';
        return this.httpGet<SearchResult<GithubRepo>>(url, {q, ...listQuery(options)}, config);
    }

    async searchUsers(q: string, options?: GithubListOptions, config?: RequestOptions)
    {
        const url = '/search/users';
        return this.httpGet<SearchResult<GithubUser>>(url, {q, ...listQuery(options)}, config);
    }

    async searchIssues(q: string, options?: GithubListOptions, config?: RequestOptions)
    {
        const url = '/search/issues';
        return this.httpGet<SearchResult<GithubIssue>>(url, {q, ...listQuery(options)}, config);
    }


    //Rate limit - this endpoint is the only one that does not count against
    //your own budget. `rateLimitOf(response)` reads the same numbers off the
    //headers of a call you were making anyway.

    async getRateLimit(config?: RequestOptions)
    {
        const url = '/rate_limit';
        return this.httpGet<RateLimitResponse>(url, undefined, config);
    }


    /*
    Follow one of the absolute URLs `linksOf()` read out of the `Link` header.

    It goes through the client rather than through a bare `fetch` so the token
    and the media-type headers come along, which is the whole reason this is a
    method and not something the caller can just as easily do themselves:

        let res = await api.getRepoIssues('owner', 'repo', {perPage: 100});
        const all = [...await res.json()];

        for (let links = linksOf(res); links.next; links = linksOf(res)) {
            res = await api.getPage<Array<GithubIssue>>(links.next);
            all.push(...await res.json());
        }
    */
    async getPage<T>(url: string, config?: RequestOptions)
    {
        return this.httpGet<T>(url, undefined, config);
    }

}

export {GithubApi, baseUrl, acceptHeader, apiVersion}
export type {GithubOptions}
