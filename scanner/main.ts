import { Octokit as OctokitCore } from '@octokit/core';
import { paginateGraphql } from '@octokit/plugin-paginate-graphql';
import { throttling } from '@octokit/plugin-throttling';
import specs from 'browser-specs' assert { type: "json" };
import fs from 'node:fs/promises';
import { mean, quantileSorted } from 'simple-statistics';
import config from './third_party/config.cjs';

const Octokit = OctokitCore.plugin(throttling, paginateGraphql);
function onRateLimit(limitName: string) {
  return (retryAfter, options: any, octokit, retryCount) => {
    octokit.log.warn(
      `${limitName} exceeded for request ${JSON.stringify(options)}`,
    );

    if (retryCount < 2) {
      // Retry twice, just in case the client and server times differ.
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

const issueQueryContent = `pageInfo {
  endCursor
  hasNextPage
}
nodes {
  title
  url
  createdAt
  closedAt
  author {
    login
  }
  labels(first: 100) {
    nodes {
      name
    }
  }
  comments(first: 5) {
    nodes {
      publishedAt
      author {
        login
      }
    }
  }
}`;
const prQueryContent = `pageInfo {
  endCursor
  hasNextPage
}
nodes {
  title
  url
  createdAt
  closedAt
  isDraft
  author {
    login
  }
  labels(first: 100) {
    nodes {
      name
    }
  }
  comments(first: 5) {
    nodes {
      publishedAt
      author {
        login
      }
    }
  }
  reviews(first: 5) {
    nodes {
      publishedAt
      author {
        login
      }
    }
  }
  reviewThreads(first: 5) {
    nodes {
      comments(first: 1) {
        nodes {
          publishedAt
          author {
            login
          }
        }
      }
    }
  }
}`;

async function getIssues(org, repo): Promise<any[]> {
  const result: any = await octokit.graphql(
    `query ($owner: String!, $repoName: String!) {
      repository(owner: $owner, name: $repoName) {
        issues(first: 50) {
          ${issueQueryContent}
        }
        pullRequests(first: 40) {
          ${prQueryContent}
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
            ${issueQueryContent}
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
          pullRequests(first: 50, after: $cursor) {
            ${prQueryContent}
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
  author?: string;
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
  arr.sort((a, b) => a - b);
  for (const percentile of [10, 25, 50, 75, 90]) {
    result[percentile] = quantileSorted(arr, percentile / 100);
  }
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
  if (!result || now - result.cachedAt > 24 * 60 * 60 * 1000) {
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
        author: issue.author?.login,
        created_at,
        ageMs: result!.cachedAt - created_at.getTime(),
        labels: issue.labels.nodes.map(label => label.name),
      };
      if (issue.closedAt) {
        info.closed_at = new Date(issue.closedAt);
        info.ageMs = info.closed_at.getTime() - info.created_at.getTime();
      }
      if ('isDraft' in issue) {
        info.pull_request = { draft: issue.isDraft }
      }
      const commentTimes = issue.comments.nodes.concat(
        issue.reviews?.nodes, issue.reviewThreads?.nodes?.comments?.nodes)
        .filter(e => e != null).flatMap(comment => {
          if (comment.author?.login === issue.author?.login) {
            // Ignore authors replying to themselves.
            return [];
          }
          return new Date(comment.publishedAt).getTime();
        });
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
      if (issue.pull_request && !issue.firstCommentLatencyMs) {
        // Pull requests that are closed with no comments by anyone other than their author, are
        // usually maintainers just developing in public. This style of development doesn't really
        // have anything for an SLO to apply to, so I'll ignore this kind of PR.

        // Issues like this are similar, except they might inspire a pull request, which I'm not
        // analyzing yet, so I'll keep them around.
        continue;
      }
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
  console.log(`[${globalStats.reposFinished}/${globalStats.totalRepos} ${new Date().toISOString()}] ${org}/${repo}`);

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
  for (const { org, repo } of githubRepos) {
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
