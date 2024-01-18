import { Temporal } from "@js-temporal/polyfill";
import { IssueSummary, RepoSummary } from '@lib/repo-summaries.js';
import fs from 'node:fs/promises';
import { browserSpecs } from "./browser-specs.js";
import { IssueOrPr, fetchAllComments, getRepo, logRateLimit } from "./github.js";
import { NeedsReporterFeedback, countSloTime, hasLabels, whichSlo } from "./slo.js";
import config from './third_party/config.cjs';

interface GlobalStatsInput {
  totalRepos: number,
  reposFinished: number;
}

async function analyzeRepo(org: string, repoName: string, globalStats: GlobalStatsInput): Promise<RepoSummary> {
  const now = Temporal.Now.instant().round("second");
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
  if (!result || Temporal.Duration.compare(result.cachedAt.until(now), { hours: 22 }) > 0) {
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
    const needEarlyComments: IssueOrPr[] = [];
    const needAllComments: IssueOrPr[] = [];
    for (const issue of allIssues) {
      // Fetch comments for the issues whose SLO calculation needs their comments.
      if (issue.timelineItems.nodes.some(item =>
        item.__typename === 'LabeledEvent' && NeedsReporterFeedback(item.label.name))) {
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
        info.pull_request = { draft: issue.isDraft! };
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
          (timelineItem.__typename === 'IssueComment' ||
            timelineItem.__typename === 'PullRequestReview' ||
            timelineItem.__typename === 'PullRequestReviewThread')
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
  for (const spec of await browserSpecs()) {
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
