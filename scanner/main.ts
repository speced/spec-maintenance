import Bottleneck from "bottleneck";
import specs from 'browser-specs' assert { type: "json" };
import fs from 'node:fs/promises';
import { mean, quantile } from 'simple-statistics';
import config from './third_party/config.cjs';
import octokit from './third_party/octokit-cache.js';

const ghLimiter = new Bottleneck({
  maxConcurrent: 20,
});

async function getIssues(octokit, org, repo): Promise<any[]> {
  return ghLimiter.schedule(() => octokit.get(`/v3/repos/${org}/${repo}/issues?state=all&fields=number,html_url,title,created_at,labels,closed_at,pull_request,milestone`));
}
async function getComments(octokit, org, repo, issueNumber: number): Promise<any[]> {
  try {
    return await ghLimiter.schedule(() =>
      octokit.get(`/v3/repos/${org}/${repo}/issues/${issueNumber}/comments?fields=created_at`));
  } catch (e) {
    if (e instanceof Error && e.cause === 404) {
      // If an issue gets deleted, its comment list will return 404. Pretend it has no comments in
      // that case.
      return [];
    }
    throw e;
  }
}

const now = Date.now();

interface IssueSummary {
  number: number;
  url: string;
  title: string;
  created_at: Date;
  closed_at?: Date;
  ageMs: number;
  pull_request?: { draft: boolean };
  milestone?: string;
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
  openFirstCommentLatencyMs?: AgeStats;
  closedFirstCommentLatencyMs?: AgeStats;
}

interface GlobalStatsInput {
  closeAgesMs: number[];
  openAgesMs: number[];
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
  if (!result || now - result.cachedAt > 60 * 60 * 1000) {
    result = {
      cachedAt: now,
      org, repo,
      issues: [],
      labelsPresent: false
    };

    result.issues = await Promise.all((await getIssues(octokit, org, repo)).map(async issue => {
      const created_at = new Date(issue.created_at);
      const info: IssueSummary = {
        number: issue.number,
        url: issue.html_url,
        title: issue.title,
        created_at,
        ageMs: now - created_at.getTime(),
        labels: issue.labels?.map(label => label.name) ?? [],
      };
      if (issue.closed_at) {
        info.closed_at = new Date(issue.closed_at);
        info.ageMs = now - info.closed_at.getTime();
      }
      if (issue.pull_request) {
        info.pull_request = { draft: issue.pull_request.draft }
      }
      if (issue.milestone) {
        info.milestone = issue.milestone.title;
      }
      const commentTimes = (await getComments(octokit, org, repo, issue.number)).map(
        comment => new Date(comment.created_at).getTime());
      if (commentTimes.length > 0) {
        info.firstCommentLatencyMs = Math.min(...commentTimes) - info.created_at.getTime();
      }
      return info;
    }));
  }

  const closeAgesMs: number[] = [];
  const openAgesMs: number[] = [];
  const closedFirstCommentLatencyMs: number[] = [];
  const openFirstCommentLatencyMs: number[] = [];
  for (const issue of result.issues) {
    if (issue.closed_at) {
      closeAgesMs.push(issue.closed_at.valueOf() - issue.created_at.valueOf());
      if (issue.firstCommentLatencyMs) {
        closedFirstCommentLatencyMs.push(issue.firstCommentLatencyMs);
      }
    } else {
      openAgesMs.push(result.cachedAt - issue.created_at.valueOf());
      if (issue.firstCommentLatencyMs) {
        openFirstCommentLatencyMs.push(issue.firstCommentLatencyMs);
      }
    }
  }
  result.ageAtCloseMs = ageStats(closeAgesMs);
  result.openAgeMs = ageStats(openAgesMs);
  result.closedFirstCommentLatencyMs = ageStats(closedFirstCommentLatencyMs);
  result.openFirstCommentLatencyMs = ageStats(openFirstCommentLatencyMs);
  globalStats.closeAgesMs.push(...closeAgesMs);
  globalStats.openAgesMs.push(...openAgesMs);
  globalStats.closedFirstCommentLatencyMs.push(...closedFirstCommentLatencyMs);
  globalStats.openFirstCommentLatencyMs.push(...openFirstCommentLatencyMs);

  await fs.mkdir(`${config.outDir}/${org}`, { recursive: true });
  await fs.writeFile(`${config.outDir}/${org}/${repo}.json`, JSON.stringify(result, undefined, 2));

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

  const globalStats: GlobalStatsInput = {
    openAgesMs: [], closeAgesMs: [],
    openFirstCommentLatencyMs: [], closedFirstCommentLatencyMs: []
  };
  await Promise.all(githubRepos.map(({ org, repo }) => analyzeRepo(org, repo, globalStats)));

  await fs.writeFile(`${config.outDir}/global.json`, JSON.stringify({
    ageAtCloseMs: ageStats(globalStats.closeAgesMs),
    openAgeMs: ageStats(globalStats.openAgesMs),
    closedFirstCommentLatencyMs: ageStats(globalStats.closedFirstCommentLatencyMs),
    openFirstCommentLatencyMs: ageStats(globalStats.openFirstCommentLatencyMs),
  }, undefined, 2));
}

await main();
