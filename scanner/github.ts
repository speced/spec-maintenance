import { Temporal } from "@js-temporal/polyfill";
import { Octokit as OctokitCore } from "@octokit/core";
import { paginateGraphql } from "@octokit/plugin-paginate-graphql";
import { throttling } from "@octokit/plugin-throttling";
import { RequestError } from "@octokit/request-error";
import config from "./third_party/config.cjs";

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
}`);
const unlabeledFragment = gql(`fragment unlabeledFragment on UnlabeledEvent {
  createdAt
  label {
    name
  }
}`);
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

export async function fetchAllComments(needAllComments: any[], needEarlyComments: any[]) {
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
  let rateLimit: { cost: number; remaining: number | null; } = { cost: 0, remaining: null };
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
  console.log(`Fetched early comments for ${numEarlyComments} issues, with rate limit ${JSON.stringify(rateLimit)}.`);

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
    issue.timelineItems.nodes.sort((a, b) => Temporal.Instant.compare(a.createdAt, b.createdAt));
  }
}

export async function getRepo(org, repo): Promise<any> {
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
    });
    result.repository.pullRequests.nodes.push(...remainingPRs.repository.pullRequests.nodes);
  }
  return result.repository;
}

export async function logRateLimit() {
  console.log(await octokit.graphql(
    gql(`query {
      rateLimit {
        limit
        remaining
        resetAt
      }
    }`)));
}
