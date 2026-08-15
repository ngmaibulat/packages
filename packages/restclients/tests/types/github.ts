/*
Compile-time assertions for the github client. See ./jsonplaceholder.ts
for why these files exist.
*/

import type {TypedResponse} from '../../src/core/index.ts';

import {GithubApi, parseLink, rateLimitOf, linksOf} from '../../src/github/index.ts';
import type {GithubUser, GithubRepo, GithubIssue, GithubCommit} from '../../src/github/index.ts';
import type {GithubContributor, GithubRelease, GithubContent} from '../../src/github/index.ts';
import type {SearchResult, RateLimitResponse, RateLimit, PageLinks} from '../../src/github/index.ts';

const gh = new GithubApi();


//Collections are bare arrays; search is the exception that wraps

const _repos: Promise<TypedResponse<Array<GithubRepo>>> = gh.getUserRepos('octocat');
const _issues: Promise<TypedResponse<Array<GithubIssue>>> = gh.getRepoIssues('a', 'b');
const _commits: Promise<TypedResponse<Array<GithubCommit>>> = gh.getRepoCommits('a', 'b');
const _contributors: Promise<TypedResponse<Array<GithubContributor>>> = gh.getRepoContributors('a', 'b');
const _releases: Promise<TypedResponse<Array<GithubRelease>>> = gh.getReleases('a', 'b');
const _search: Promise<TypedResponse<SearchResult<GithubRepo>>> = gh.searchRepositories('axios');

// @ts-expect-error -- search wraps its results in an envelope
const _searchIsNotBare: Promise<TypedResponse<Array<GithubRepo>>> = gh.searchRepositories('axios');

// @ts-expect-error -- a repo list is not wrapped
const _reposAreNotWrapped: Promise<TypedResponse<SearchResult<GithubRepo>>> = gh.getUserRepos('octocat');


//Get-one

const _user: Promise<TypedResponse<GithubUser>> = gh.getUser('octocat');
const _repo: Promise<TypedResponse<GithubRepo>> = gh.getRepo('a', 'b');
const _issue: Promise<TypedResponse<GithubIssue>> = gh.getIssue('a', 'b', 1);
const _readme: Promise<TypedResponse<GithubContent>> = gh.getReadme('a', 'b');
const _languages: Promise<TypedResponse<Record<string, number>>> = gh.getRepoLanguages('a', 'b');
const _rate: Promise<TypedResponse<RateLimitResponse>> = gh.getRateLimit();

/* getPage carries whatever the caller says the next page holds. */
const _page: Promise<TypedResponse<Array<GithubIssue>>> = gh.getPage<Array<GithubIssue>>('https://api.github.com/x?page=2');

// @ts-expect-error -- a repo is not a user
const _crossed: Promise<TypedResponse<GithubUser>> = gh.getRepo('a', 'b');


//List options

gh.getUserRepos('octocat', {perPage: 100, page: 2, type: 'owner', sort: 'pushed', direction: 'desc'});
gh.getRepoIssues('a', 'b', {state: 'all', labels: ['bug', 'docs'], since: '2026-01-01T00:00:00Z'});
gh.getRepoIssues('a', 'b', {labels: 'bug'});

// @ts-expect-error -- state is a three-value union
gh.getRepoIssues('a', 'b', {state: 'pending'});

// @ts-expect-error -- repo sort keys are a fixed set
gh.getUserRepos('octocat', {sort: 'stars'});

// @ts-expect-error -- a typo'd option is not silently ignored
gh.getUserRepos('octocat', {per_page: 100});


//The header helpers are functions over a response, not methods on the client

const _links: PageLinks = parseLink('<https://api.github.com/x>; rel="next"');
const _noLinks: PageLinks = parseLink(undefined);

declare const response: TypedResponse<Array<GithubRepo>>;

const _fromResponse: PageLinks = linksOf(response);
const _budget: RateLimit = rateLimitOf(response);

/* Every field is independently optional -- a proxied response may drop some. */
const _reset: Date | undefined = _budget.reset;
const _remaining: number | undefined = _budget.remaining;

// @ts-expect-error -- reset is a Date, not the unix seconds the header carries
const _resetIsNotANumber: number | undefined = _budget.reset;


//The token and version are options alongside the request defaults

const _authed = new GithubApi({token: 'ghp_x', version: '2022-11-28', timeout: 1000});

// @ts-expect-error -- unknown options are rejected
new GithubApi({tokne: 'ghp_x'});


export type {};
