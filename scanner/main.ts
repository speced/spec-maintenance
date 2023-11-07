import { Temporal } from "@js-temporal/polyfill";
import { IssueSummary, RepoSummary, SloType } from '@lib/repo-summaries.js';
import { Octokit as OctokitCore } from '@octokit/core';
import { paginateGraphql } from '@octokit/plugin-paginate-graphql';
import { throttling } from '@octokit/plugin-throttling';
import { RequestError } from "@octokit/request-error";
import specs from 'browser-specs' assert { type: "json" };
import fs from 'node:fs/promises';
import config from './third_party/config.cjs';

const Octokit = OctokitCore.plugin(throttling, paginateGraphql);
function onRateLimit(limitName: string) {
  return (retryAfter, options: any, octokit, retryCount) => {
    octokit.log.warn(
      `${limitName} exceeded for request ${JSON.stringify(options)}`,
    );

    if (retryCount < 1) {
      // Retry once.
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
    milestone {
      url
      title
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
    milestone {
      url
      title
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

async function fetchAllComments(needAllComments: any[], needEarlyComments: any[]) {
  // First, fetch the early comments from every issue, and add them into the issue. Then we'll page
  // through the comments on the issues that need a complete set.
  needEarlyComments = needEarlyComments.concat(needAllComments);
  const issueById = new Map<string, any>();
  for (const issue of needEarlyComments) {
    issueById.set(issue.id, issue);
  }
  const query = gql(`query ($ids: [ID!]!, $itemCount: Int!, $cursor: String) {
    rateLimit {
      cost
      remaining
    }
    nodes(ids: $ids) {
      __typename
      id
      ... on Issue {
        timelineItems(first: $itemCount, after: $cursor, itemTypes: [ISSUE_COMMENT]) {
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
        timelineItems(first: $itemCount, after: $cursor, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW, PULL_REQUEST_REVIEW_THREAD]) {
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
  }`);
  let rateLimit: { cost: number, remaining: number | null } = { cost: 0, remaining: null };
  let fetchAtOnce = 100;
  const numEarlyComments = needEarlyComments.length;
  while (needEarlyComments.length > 0) {
    const initial = needEarlyComments.splice(0, fetchAtOnce);
    const result: any = await octokit.graphql(query, {
      ids: initial.map(issue => issue.id),
      itemCount: 5,
    });
    rateLimit.cost += result.rateLimit.cost;
    rateLimit.remaining = result.rateLimit.remaining;
    for (const issue of result.nodes) {
      const fullIssue = issueById.get(issue.id);
      fullIssue.timelineItems.totalComments = issue.timelineItems.totalCount;
      fullIssue.timelineItems.commentPageInfo = issue.timelineItems.pageInfo;
      fullIssue.timelineItems.nodes.push(...issue.timelineItems.nodes);
    }
  }
  console.log(`Fetched early comments for ${numEarlyComments} issues, with rate limit ${JSON.stringify(rateLimit)}.`)

  for (const issue of needAllComments) {
    if (!issue.timelineItems.commentPageInfo.hasNextPage) {
      continue;
    }
    console.log(`Paging through comments on issue ${issue.number}; id ${issue.id}.`);
    const result: any = await octokit.graphql.paginate(query, {
      ids: [issue.id],
      itemCount: 100,
      cursor: issue.timelineItems.commentPageInfo.endCursor,
    });
    issue.timelineItems.nodes.push(...result.nodes.timelineItems.nodes);
    for (const timelineItem of issue.timelineItems.nodes) {
      if (timelineItem.__typename === 'PullRequestReviewThread') {
        timelineItem.createdAt = timelineItem.comments.nodes[0]?.createdAt;
        timelineItem.author = timelineItem.comments.nodes[0]?.author;
      }
    }
    issue.timelineItems.nodes.sort((a, b) =>
      Temporal.Instant.compare(a.createdAt, b.createdAt));
  }
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
    const query = gql(`query ($owner: String!, $repoName: String!, $cursor: String, $pageSize: Int!) {
        repository(owner: $owner, name: $repoName) {
          issues(first: $pageSize, states: [OPEN], after: $cursor) {
            ...issueFragment
          }
        }
      }
      ${issueFragment}
      ${labeledFragment}
      ${unlabeledFragment}`);
    const vars = {
      owner: org,
      repoName: repo,
      cursor: result.repository.issues.pageInfo.endCursor,
      pageSize: 99, // 100 leads to a rate limit cost of 2.
    };
    let remainingIssues: any = null;
    try {
      remainingIssues = await octokit.graphql.paginate(query, vars);
    } catch (e: unknown) {
      if (e instanceof RequestError) {
        let data: any = e.response?.data;
        if (data?.errors?.some(({ message }) =>
          message?.startsWith(
            "Something went wrong while executing your query. This may be the result of a timeout"))) {
          vars.pageSize = Math.ceil(vars.pageSize / 4);
          console.warn(`${JSON.stringify(data.errors)}\nScaling back to ${vars.pageSize} issues per page.`);
          remainingIssues = await octokit.graphql.paginate(query, vars);
        } else {
          console.error(JSON.stringify(data));
          throw e;
        }
      } else {
        throw e;
      }
    }
    result.repository.issues.nodes.push(...remainingIssues.repository.issues.nodes);
  }
  if (result.repository.pullRequests.pageInfo.hasNextPage) {
    console.log(`Paging through PRs on ${org}/${repo}.`);
    const remainingPRs = await octokit.graphql.paginate(
      gql(`query ($owner: String!, $repoName: String!, $cursor: String) {
        repository(owner: $owner, name: $repoName) {
          pullRequests(first: 50, states: [OPEN], after: $cursor) {
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

const now = Temporal.Now.instant().round('second');

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

function countSloTime(issue, now: Temporal.Instant): Temporal.Duration {
  let timeUsed = Temporal.Duration.from({ seconds: 0 });
  type PauseReason = "draft" | "need-feedback" | "closed";
  let pauseReason = new Set<PauseReason>();
  let draftChanged = false;
  let sloStartTime = Temporal.Instant.from(issue.createdAt);

  for (const timelineItem of issue.timelineItems.nodes) {
    function pause(reason: PauseReason) {
      if (pauseReason.size === 0) {
        timeUsed = timeUsed.add(sloStartTime.until(timelineItem.createdAt));
      }
      pauseReason.add(reason);
    }
    function unpause(reason: PauseReason) {
      const deleted = pauseReason.delete(reason);
      if (pauseReason.size === 0 && deleted) {
        sloStartTime = Temporal.Instant.from(timelineItem.createdAt);
      }
    }
    switch (timelineItem.__typename) {
      case 'ReadyForReviewEvent':
        if (!draftChanged) {
          // If the first change in draft status is to become ready for review, then the SLO must
          // have been paused for all previous events.
          timeUsed = Temporal.Duration.from({ seconds: 0 });
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
    timeUsed = timeUsed.add(sloStartTime.until(now));
  }
  return timeUsed.round({ largestUnit: 'days' });
}

async function analyzeRepo(org: string, repoName: string, globalStats: GlobalStatsInput): Promise<RepoSummary> {
  let result: RepoSummary | null = null;
  try {
    result = JSON.parse(await fs.readFile(`${config.outDir}/${org}/${repoName}.json`, { encoding: 'utf8' }),
      (key, value) => {
        if (key === 'cachedAt') {
          return Temporal.Instant.from(value);
        }
        return value;
      });
  } catch {
    // On error, fetch the body.
  }
  if (!result || Temporal.Duration.compare(result.cachedAt.until(now), { hours: 24 }) > 0) {
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

    const allIssues = repo.issues.nodes.concat(repo.pullRequests.nodes);
    const needEarlyComments: any[] = [];
    const needAllComments: any[] = [];
    for (const issue of allIssues) {
      // Fetch comments for the issues whose SLO calculation needs their comments.
      if (issue.timelineItems.nodes.some(item =>
        item.__typename === 'LabeledEvent' && item.label.name === NEEDS_REPORTER_FEEDBACK)) {
        needAllComments.push(issue);
      } else if (!result.labelsPresent && !issue.milestone) {
        // We only need to see a few comments to see if someone other than the initial author has
        // commented. This'll miss if the initial author has a long conversation with themself, but
        // that should be rare.
        needEarlyComments.push(issue);
      }
    }

    await fetchAllComments(needAllComments, needEarlyComments);

    for (const issue of allIssues) {
      const info: IssueSummary = {
        url: issue.url,
        title: issue.title,
        author: issue.author?.login,
        createdAt: issue.createdAt,
        sloTimeUsed: Temporal.Duration.from({ seconds: 0 }),
        whichSlo: whichSlo(issue),
        labels: issue.labels.nodes.map(label => label.name),
        stats: {
          numTimelineItems: issue.timelineItems.totalCount,
          numComments: issue.timelineItems.totalComments,
          numLabels: issue.labels.totalCount,
        }
      };
      if (issue.__typename === 'PullRequest') {
        info.pull_request = { draft: issue.isDraft };
      }
      if (issue.milestone) {
        info.milestone = {
          url: issue.milestone.url,
          title: issue.milestone.title,
        };
      }
      if (!result.labelsPresent && (
        issue.milestone ||
        issue.timelineItems.nodes.some(timelineItem =>
          ['IssueComment', 'PullRequestReview', 'PullRequestReviewThread'].includes(timelineItem.__typename)
          && info.author !== timelineItem.author?.login
        ))) {
        // If the repository doesn't have the triage labels, and an issue or PR has a comment from
        // someone other than its creator, assume that person has also triaged the issue.
        info.whichSlo = "none";
      }
      info.sloTimeUsed = countSloTime(issue, now);
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
