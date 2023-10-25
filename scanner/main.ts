import { Octokit as OctokitCore } from '@octokit/core';
import { paginateGraphql } from '@octokit/plugin-paginate-graphql';
import { throttling } from '@octokit/plugin-throttling';
import specs from 'browser-specs' assert { type: "json" };
import fs from 'node:fs/promises';
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

/** Enables syntax highlighting from the GraphQL editor extension. */
function gql(str: string) { return str; }

const labeledFragment = gql(`fragment labeledFragment on LabeledEvent {
  createdAt
  label {
    name
  }
}`)
const unlabeledFragment = gql(`fragment unlabeledFragment on UnlabeledEvent {
  createdAt
  label {
    name
  }
}`)
const issueFragment = gql(`fragment issueFragment on IssueConnection {
  totalCount
  pageInfo {
    endCursor
    hasNextPage
  }
  nodes {
    __typename
    id
    number
    title
    url
    createdAt
    author {
      login
    }
    labels(first: 100) {
      totalCount
      nodes {
        name
      }
    }
    timelineItems(first:100, itemTypes:[LABELED_EVENT, UNLABELED_EVENT, CLOSED_EVENT, REOPENED_EVENT]){
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        __typename
        ... on ClosedEvent {
          createdAt
        }
        ... on ReopenedEvent {
          createdAt
        }
        ...labeledFragment
        ...unlabeledFragment
      }
    }
  }
}`);
const prFragment = gql(`fragment prFragment on PullRequestConnection {
  totalCount
  pageInfo {
    endCursor
    hasNextPage
  }
  nodes {
    __typename
    id
    number
    title
    url
    createdAt
    isDraft
    author {
      login
    }
    labels(first: 100) {
      totalCount
      nodes {
        name
      }
    }
    timelineItems(first:100, itemTypes:[READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT, LABELED_EVENT, UNLABELED_EVENT, CLOSED_EVENT, REOPENED_EVENT]){
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        __typename
        ... on ReadyForReviewEvent {
          createdAt
        }
        ... on ConvertToDraftEvent {
          createdAt
        }
        ... on ClosedEvent {
          createdAt
        }
        ... on ReopenedEvent {
          createdAt
        }
        ...labeledFragment
        ...unlabeledFragment
      }
    }
  }
}`);

async function fetchAllComments(issue: any): Promise<{totalComments: number}> {
  console.log(`Paging through comments on issue ${issue.number}; id ${issue.id}.`);
  const result: any = await octokit.graphql.paginate(
    gql(`query ($id: ID!, $cursor: String) {
      node(id: $id) {
        __typename
        ... on Issue {
          timelineItems(first: 100, after: $cursor, itemTypes: [ISSUE_COMMENT]) {
            totalCount
            pageInfo {
              endCursor
              hasNextPage
            }
            nodes {
              __typename
              ...commentFields
            }
          }
        }
        ... on PullRequest {
          timelineItems(first: 100, after: $cursor, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW, PULL_REQUEST_REVIEW_THREAD]) {
            totalCount
            pageInfo {
              endCursor
              hasNextPage
            }
            nodes {
              __typename
              ...commentFields
              ... on PullRequestReviewThread {
                comments(first: 1) {
                  nodes {
                    ...commentFields
                  }
                }
              }
            }
          }
        }
      }
    }
    fragment commentFields on Comment {
      createdAt
      author {
        login
      }
    }`),
    {
      id: issue.id,
    });
  for (const timelineItem of result.node.timelineItems.nodes) {
    if (timelineItem.__typename === 'PullRequestReviewThread') {
      timelineItem.createdAt = timelineItem.comments.nodes[0]?.createdAt;
      timelineItem.author = timelineItem.comments.nodes[0]?.author;
    }
  }
  issue.timelineItems.nodes.push(...result.node.timelineItems.nodes);
  issue.timelineItems.nodes.sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return {totalComments: result.node.timelineItems.totalCount};
}

async function getRepo(org, repo): Promise<any> {
  console.log(`Fetching ${org}/${repo}.`);
  const result: any = await octokit.graphql(
    gql(`query ($owner: String!, $repoName: String!) {
      repository(owner: $owner, name: $repoName) {
        labels(first: 100, query: "Priority") {
          totalCount
          nodes {
            name
          }
        }
        issues(first: 50, states: [OPEN]) {
          ...issueFragment
        }
        pullRequests(first: 40, states: [OPEN]) {
          ...prFragment
        }
      }
    }
    ${issueFragment}
    ${prFragment}
    ${labeledFragment}
    ${unlabeledFragment}`),
    {
      owner: org,
      repoName: repo,
    });

  if (result.repository.issues.pageInfo.hasNextPage) {
    console.log(`Paging through issues on ${org}/${repo}.`);
    const remainingIssues = await octokit.graphql.paginate(
      gql(`query ($owner: String!, $repoName: String!, $cursor: String) {
        repository(owner: $owner, name: $repoName) {
          issues(first: 100, after: $cursor) {
            ...issueFragment
          }
        }
      }
      ${issueFragment}
      ${labeledFragment}
      ${unlabeledFragment}`), {
      owner: org,
      repoName: repo,
      cursor: result.repository.issues.pageInfo.endCursor
    });
    result.repository.issues.nodes.push(...remainingIssues.repository.issues.nodes);
  }
  if (result.repository.pullRequests.pageInfo.hasNextPage) {
    console.log(`Paging through PRs on ${org}/${repo}.`);
    const remainingPRs = await octokit.graphql.paginate(
      gql(`query ($owner: String!, $repoName: String!, $cursor: String) {
        repository(owner: $owner, name: $repoName) {
          pullRequests(first: 50, after: $cursor) {
            ...prFragment
          }
        }
      }
      ${prFragment}
      ${labeledFragment}
      ${unlabeledFragment}`), {
      owner: org,
      repoName: repo,
      cursor: result.repository.pullRequests.pageInfo.endCursor
    })
    result.repository.pullRequests.nodes.push(...remainingPRs.repository.pullRequests.nodes);
  }
  return result.repository;
}

async function logRateLimit() {
  console.log(await octokit.graphql(
    gql(`query {
      rateLimit {
        limit
        remaining
        resetAt
      }
    }`)));
}

const now = Date.now();

type SloType = "triage" | "urgent" | "important" | "none";

interface IssueSummary {
  url: string;
  title: string;
  author?: string;
  createdAt: string;
  sloTimeUsedMs: number;
  whichSlo: SloType;
  pull_request?: { draft: boolean };
  labels: string[];
  firstCommentLatencyMs?: number;
  stats: {
    numTimelineItems: number;
    numComments?: number;
    numLabels: number;
  };
};

interface RepoSummary {
  cachedAt: number;
  org: string;
  repo: string;
  issues: IssueSummary[];
  labelsPresent: boolean;
  stats: {
    numLabels: number;
    numIssues: number;
    numPRs: number;
  };
}

interface GlobalStatsInput {
  totalRepos: number,
  reposFinished: number;
}

export const PRIORITY_URGENT = "Priority: Urgent";
export const PRIORITY_IMPORTANT = "Priority: Important";
export const PRIORITY_EVENTUALLY = "Priority: Eventually";
export const NEEDS_REPORTER_FEEDBACK = "Needs Reporter Feedback";

function hasLabels(repo: any): boolean {
  return [PRIORITY_URGENT, PRIORITY_IMPORTANT, PRIORITY_EVENTUALLY].every(label =>
    repo.labels.nodes.some(labelNode => labelNode.name === label))
}

function whichSlo(issue): SloType {
  const labels: string[] = issue.labels.nodes.map(label => label.name);
  if (issue.isDraft || labels.includes(PRIORITY_EVENTUALLY) || labels.includes(NEEDS_REPORTER_FEEDBACK)) {
    return "none";
  }
  if (labels.includes(PRIORITY_URGENT)) {
    return "urgent";
  }
  if (labels.includes(PRIORITY_IMPORTANT)) {
    return "important";
  }
  return "triage";
}

function countSloTime(issue, now: Date): number {
  let timeUsed = 0;
  type PauseReason = "draft" | "need-feedback" | "closed";
  let pauseReason = new Set<PauseReason>();
  let draftChanged = false;
  let sloStartTime = new Date(issue.createdAt);

  for (const timelineItem of issue.timelineItems.nodes) {
    function pause(reason: PauseReason) {
      if (pauseReason.size === 0) {
        timeUsed += new Date(timelineItem.createdAt).getTime() - sloStartTime.getTime();
      }
      pauseReason.add(reason);
    }
    function unpause(reason: PauseReason) {
      const deleted = pauseReason.delete(reason);
      if (pauseReason.size === 0 && deleted) {
        sloStartTime = new Date(timelineItem.createdAt);
      }
    }
    switch (timelineItem.__typename) {
      case 'ReadyForReviewEvent':
        if (!draftChanged) {
          // If the first change in draft status is to become ready for review, then the SLO must
          // have been paused for all previous events.
          timeUsed = 0;
          draftChanged = true;
        }
        unpause("draft");
        break;
      case 'ConvertToDraftEvent':
        draftChanged = true;
        pause("draft");
        break;
      case 'LabeledEvent':
        if (timelineItem.label.name === NEEDS_REPORTER_FEEDBACK) {
          pause("need-feedback");
        }
        break;
      case 'UnlabeledEvent':
        if (timelineItem.label.name === NEEDS_REPORTER_FEEDBACK) {
          unpause("need-feedback");
        }
        break;
      case 'ClosedEvent':
        pause("closed");
        break;
      case 'ReopenedEvent':
        unpause("closed");
        break;
      case 'IssueComment':
      case 'PullRequestReview':
      case 'PullRequestReviewThread':
        if (timelineItem.author?.login !== issue.author?.login) {
          unpause("need-feedback");
        }
        break;
    }
  }
  if (pauseReason.size === 0) {
    timeUsed += now.getTime() - sloStartTime.getTime();
  }
  return timeUsed;
}

async function analyzeRepo(org: string, repoName: string, globalStats: GlobalStatsInput): Promise<RepoSummary> {
  let result: RepoSummary | null = null;
  try {
    result = JSON.parse(await fs.readFile(`${config.outDir}/${org}/${repoName}.json`, { encoding: 'utf8' }));
  } catch {
    // On error, fetch the body.
  }
  if (!result || now - result.cachedAt > 24 * 60 * 60 * 1000) {
    const repo = await getRepo(org, repoName);

    result = {
      cachedAt: now,
      org, repo: repoName,
      issues: [],
      labelsPresent: hasLabels(repo),
      stats: {
        numLabels: repo.labels.totalCount,
        numIssues: repo.issues.totalCount,
        numPRs: repo.pullRequests.totalCount,
      }
    };

    for (const issue of repo.issues.nodes.concat(repo.pullRequests.nodes)) {
      const info: IssueSummary = {
        url: issue.url,
        title: issue.title,
        author: issue.author?.login,
        createdAt: issue.createdAt,
        sloTimeUsedMs: 0,
        whichSlo: whichSlo(issue),
        labels: issue.labels.nodes.map(label => label.name),
        stats: {
          numTimelineItems: issue.timelineItems.totalCount,
          numLabels: issue.labels.totalCount,
        }
      };
      if (issue.__typename === 'PullRequest') {
        info.pull_request = { draft: issue.isDraft };
      }
      if (!result.labelsPresent ||
        issue.timelineItems.nodes.some(item =>
          item.__typename === 'LabeledEvent' && item.label.name === NEEDS_REPORTER_FEEDBACK)) {
        // When it's just that the labels aren't present, we could get away with fetching fewer than
        // all comments, but this is simpler code.
        const {totalComments} = await fetchAllComments(issue);
        info.stats.numComments = totalComments;
      }
      if (!result.labelsPresent && issue.timelineItems.nodes.some(timelineItem =>
        ['IssueComment', 'PullRequestReview', 'PullRequestReviewThread'].includes(timelineItem.__typename)
        && info.author !== timelineItem.author?.login
      )) {
        // If the repository doesn't have the triage labels, and an issue or PR has a comment from
        // someone other than its creator, assume that person has also triaged the issue.
        info.whichSlo = "none";
      }
      info.sloTimeUsedMs = countSloTime(issue, new Date(now));
      result.issues.push(info);
    };
  }

  await fs.mkdir(`${config.outDir}/${org}`, { recursive: true });
  await fs.writeFile(`${config.outDir}/${org}/${repoName}.json`, JSON.stringify(result, undefined, 2));

  globalStats.reposFinished++;
  console.log(`[${globalStats.reposFinished}/${globalStats.totalRepos} ${new Date().toISOString()}] ${org}/${repoName}`);

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
  };
  for (const { org, repo } of githubRepos) {
    await analyzeRepo(org, repo, globalStats);
  }

  logRateLimit();
}

await main();
