import { Octokit as OctokitCore } from '@octokit/core';
import { paginateGraphql } from '@octokit/plugin-paginate-graphql';
import { throttling } from '@octokit/plugin-throttling';
import specs from 'browser-specs' assert { type: "json" };
import fs from 'node:fs/promises';
import { mean, quantile } from 'simple-statistics';
import config from './third_party/config.cjs';

const Octokit = OctokitCore.plugin(throttling, paginateGraphql);
function onRateLimit(limitName: string) {
  return (retryAfter, options: any, octokit, retryCount) => {
    octokit.log.warn(
      `${limitName} exceeded for request ${JSON.stringify(options)}`,
    );

    if (retryCount < 1 && retryAfter <= 120) {
      // Retry once and for at most 2 minutes.
      console.info(`Retrying after ${retryAfter} seconds.`);
      return true;
    }
  };
}
const octokit = new Octokit({
  auth: config.ghToken,
  userAgent: 'https://github.com/jyasskin/spec-maintenance',
  throttle: {
    onRateLimit: onRateLimit('Rate limit'),
    onSecondaryRateLimit: onRateLimit('Secondary rate limit'),
  },
});

async function getIssues(org, repo): Promise<any[]> {
  const result: any = await octokit.graphql(
    `query ($owner: String!, $repoName: String!) {
      repository(owner: $owner, name: $repoName) {
        issues(first: 100) {
          pageInfo {
            endCursor
            hasNextPage
          }
          nodes {
            title
            url
            createdAt
            closedAt
            labels(first: 100) {
              nodes {
                name
              }
            }
            comments(first: 1, orderBy: {field: UPDATED_AT, direction: ASC}) {
              nodes {
                createdAt
              }
            }
          }
        }
        pullRequests(first: 100) {
          pageInfo {
            endCursor
            hasNextPage
          }
          nodes {
            title
            url
            createdAt
            closedAt
            isDraft
            labels(first: 100) {
              nodes {
                name
              }
            }
            comments(first: 1, orderBy: {field: UPDATED_AT, direction: ASC}) {
              nodes {
                createdAt
              }
            }
          }
        }
      }
    }`,
    {
      owner: org,
      repoName: repo,
    });

  if (result.repository.issues.pageInfo.hasNextPage) {
    const remainingIssues = await octokit.graphql.paginate(
      `query ($owner: String!, $repoName: String!, $cursor: String!) {
        repository(owner: $owner, name: $repoName) {
          issues(first: 100, after: $cursor) {
            pageInfo {
              endCursor
              hasNextPage
            }
            nodes {
              title
              url
              createdAt
              closedAt
              labels(first: 100) {
                nodes {
                  name
                }
              }
              comments(first: 1, orderBy: {field: UPDATED_AT, direction: ASC}) {
                nodes {
                  createdAt
                }
              }
            }
          }
        }
      }`, {
      owner: org,
      repoName: repo,
      cursor: result.repository.issues.pageInfo.endCursor
    });
    result.repository.issues.nodes.push(...remainingIssues.repository.issues.nodes);
  }
  if (result.repository.pullRequests.pageInfo.hasNextPage) {
    const remainingPRs = await octokit.graphql.paginate(
      `query ($owner: String!, $repoName: String!, $cursor: String!) {
        repository(owner: $owner, name: $repoName) {
          pullRequests(first: 100, after: $cursor) {
            pageInfo {
              endCursor
              hasNextPage
            }
            nodes {
              title
              url
              createdAt
              closedAt
              isDraft
              labels(first: 100) {
                nodes {
                  name
                }
              }
              comments(first: 1, orderBy: {field: UPDATED_AT, direction: ASC}) {
                nodes {
                  createdAt
                }
              }
            }
          }
        }
      }`, {
      owner: org,
      repoName: repo,
      cursor: result.repository.pullRequests.pageInfo.endCursor
    })
    result.repository.pullRequests.nodes.push(...remainingPRs.repository.pullRequests.nodes);
  }
  return result.repository.issues.nodes.concat(result.repository.pullRequests.nodes);
}

async function logRateLimit() {
  console.log(await octokit.graphql(
    `query {
      rateLimit {
        limit
        remaining
        resetAt
      }
    }`));
}

const now = Date.now();

interface IssueSummary {
  url: string;
  title: string;
  created_at: Date;
  closed_at?: Date;
  ageMs: number;
  pull_request?: { draft: boolean };
  labels: string[];
  firstCommentLatencyMs?: number;
};

interface AgeStats {
  count: number;
  mean: number;
  [percentile: string]: number;
};

interface RepoSummary {
  cachedAt: number;
  org: string;
  repo: string;
  issues: IssueSummary[];
  labelsPresent: boolean;
  ageAtCloseMs?: AgeStats;
  openAgeMs?: AgeStats;
  firstCommentLatencyMs?: AgeStats;
  openFirstCommentLatencyMs?: AgeStats;
  closedFirstCommentLatencyMs?: AgeStats;
}

interface GlobalStatsInput {
  totalRepos: number,
  reposFinished: number;
  closeAgesMs: number[];
  openAgesMs: number[];
  firstCommentLatencyMs: number[];
  openFirstCommentLatencyMs: number[];
  closedFirstCommentLatencyMs: number[];
}

function ageStats(arr: number[]): AgeStats | undefined {
  if (arr.length === 0) {
    return undefined;
  }
  const result = {
    count: arr.length,
    mean: mean(arr),
  }
  const percentiles = [10, 25, 50, 75, 90];
  quantile(arr, percentiles.map(p => p / 100)).forEach((q, i) => {
    result[percentiles[i]] = q;
  });
  return result;
}

async function analyzeRepo(org: string, repo: string, globalStats: GlobalStatsInput): Promise<RepoSummary> {
  let result: RepoSummary | null = null;
  try {
    result = JSON.parse(await fs.readFile(`${config.outDir}/${org}/${repo}.json`, { encoding: 'utf8' }),
      (key, value) => {
        if (['created_at', 'closed_at'].includes(key)) {
          return new Date(value);
        }
        return value;
      });
  } catch {
    // On error, fetch the body.
  }
  if (!result || now - result.cachedAt > 5 * 60 * 60 * 1000) {
    result = {
      cachedAt: now,
      org, repo,
      issues: [],
      labelsPresent: false
    };

    result.issues = (await getIssues(org, repo)).map(issue => {
      const created_at = new Date(issue.createdAt);
      const info: IssueSummary = {
        url: issue.url,
        title: issue.title,
        created_at,
        ageMs: now - created_at.getTime(),
        labels: issue.labels.nodes.map(label => label.name),
      };
      if (issue.closedAt) {
        info.closed_at = new Date(issue.closedAt);
        info.ageMs = info.closed_at.getTime() - info.created_at.getTime();
      }
      if (issue.isDraft) {
        info.pull_request = { draft: issue.isDraft }
      }
      const commentTimes = issue.comments.nodes.map(
        comment => new Date(comment.createdAt).getTime());
      if (commentTimes.length > 0) {
        info.firstCommentLatencyMs = Math.min(...commentTimes) - info.created_at.getTime();
      }
      return info;
    });
  }

  const closeAgesMs: number[] = [];
  const openAgesMs: number[] = [];
  const firstCommentLatencyMs: number[] = [];
  const closedFirstCommentLatencyMs: number[] = [];
  const openFirstCommentLatencyMs: number[] = [];
  for (const issue of result.issues) {
    if (issue.closed_at) {
      closeAgesMs.push(issue.closed_at.valueOf() - issue.created_at.valueOf());
      if (issue.firstCommentLatencyMs) {
        firstCommentLatencyMs.push(issue.firstCommentLatencyMs);
        closedFirstCommentLatencyMs.push(issue.firstCommentLatencyMs);
      }
    } else {
      openAgesMs.push(result.cachedAt - issue.created_at.valueOf());
      if (issue.firstCommentLatencyMs) {
        firstCommentLatencyMs.push(issue.firstCommentLatencyMs);
        openFirstCommentLatencyMs.push(issue.firstCommentLatencyMs);
      }
    }
  }
  result.ageAtCloseMs = ageStats(closeAgesMs);
  result.openAgeMs = ageStats(openAgesMs);
  result.firstCommentLatencyMs = ageStats(firstCommentLatencyMs);
  result.closedFirstCommentLatencyMs = ageStats(closedFirstCommentLatencyMs);
  result.openFirstCommentLatencyMs = ageStats(openFirstCommentLatencyMs);
  globalStats.closeAgesMs.push(...closeAgesMs);
  globalStats.openAgesMs.push(...openAgesMs);
  globalStats.firstCommentLatencyMs.push(...firstCommentLatencyMs);
  globalStats.closedFirstCommentLatencyMs.push(...closedFirstCommentLatencyMs);
  globalStats.openFirstCommentLatencyMs.push(...openFirstCommentLatencyMs);

  await fs.mkdir(`${config.outDir}/${org}`, { recursive: true });
  await fs.writeFile(`${config.outDir}/${org}/${repo}.json`, JSON.stringify(result, undefined, 2));

  globalStats.reposFinished++;
  console.log(`[${globalStats.reposFinished}/${globalStats.totalRepos} ${new Date()}] ${org}/${repo}`);

  return result;
}

async function main() {
  const repos = new Set<string>();
  for (const spec of specs) {
    const repo = spec.nightly.repository;
    if (repo) {
      repos.add(repo);
    }
  }

  const githubRepos: { org: string, repo: string }[] = [];
  for (const repoUrl of Array.from(repos).sort()) {
    const url = new URL(repoUrl);
    if (url.hostname !== 'github.com') {
      continue;
    }
    const parts = url.pathname.split('/').filter(s => s);
    if (parts.length !== 2) {
      continue;
    }
    const [org, repo] = parts;
    githubRepos.push({ org, repo });
  }

  logRateLimit();

  const globalStats: GlobalStatsInput = {
    totalRepos: githubRepos.length,
    reposFinished: 0,
    openAgesMs: [], closeAgesMs: [],
    firstCommentLatencyMs: [], openFirstCommentLatencyMs: [], closedFirstCommentLatencyMs: []
  };
  for (const {org, repo} of githubRepos) {
    await analyzeRepo(org, repo, globalStats);
  }

  await fs.writeFile(`${config.outDir}/global.json`, JSON.stringify({
    ageAtCloseMs: ageStats(globalStats.closeAgesMs),
    openAgeMs: ageStats(globalStats.openAgesMs),
    firstCommentLatencyMs: ageStats(globalStats.firstCommentLatencyMs),
    closedFirstCommentLatencyMs: ageStats(globalStats.closedFirstCommentLatencyMs),
    openFirstCommentLatencyMs: ageStats(globalStats.openFirstCommentLatencyMs),
  }, undefined, 2));

  logRateLimit();
}

await main();
