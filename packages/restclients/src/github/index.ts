export type {GithubUser, GithubUserRef, GithubRepo, GithubLicense} from './types.ts';
export type {GithubIssue, GithubLabel, GithubCommit, GithubCommitAuthor} from './types.ts';
export type {GithubContributor, GithubRelease, GithubContent} from './types.ts';
export type {SearchResult, RateLimitCore, RateLimitResponse, RateLimit, PageLinks} from './types.ts';
export type {GithubListOptions, RepoListOptions, IssueListOptions, GithubError} from './types.ts';

export {GithubApi, baseUrl, acceptHeader, apiVersion} from './services.ts';
export type {GithubOptions} from './services.ts';

/*
Pagination and rate limits live in response headers, not in the body, so they
are functions over a response rather than methods on the client.
*/
export {parseLink, linksOf, rateLimitOf} from './pagination.ts';

/*
`HttpError` is re-exported so consumers can `instanceof`-check failures.
A non-2xx rejects with it; a transport failure rejects with fetch's own
TypeError, and an abort with a DOMException.
*/
export {HttpError} from '../core/index.ts';
export type {ClientOptions, RequestOptions, TypedResponse} from '../core/index.ts';
