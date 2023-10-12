import Bottleneck from "bottleneck";
import specs from 'browser-specs' assert { type: "json" };
import fs from 'node:fs/promises';
import { mean, quantile } from 'simple-statistics';
import octokit from './third_party/octokit-cache.js';

const ghLimiter = new Bottleneck({
  maxConcurrent: 20,
});

async function getIssues(octokit, org, repo): Promise<any> {
  return ghLimiter.schedule(() => octokit.get(`/v3/repos/${org}/${repo}/issues?state=all&fields=number,html_url,title,created_at,labels,closed_at,pull_request,milestone`));
}

interface IssueSummary {
  number: number;
  url: string;
  title: string;
  created_at: Date;
  closed_at?: Date;
  pull_request?: { draft: boolean };
  milestone?: string;
  labels: string[];
  ageAtCloseMs?: number;
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
}

interface GlobalStatsInput {
  closeAgesMs: number[];
  openAgesMs: number[];
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
    result = JSON.parse(await fs.readFile(`summaries/${org}/${repo}.json`, { encoding: 'utf8' }),
      (key, value) => {
        if (['created_at', 'closed_at'].includes(key)) {
          return new Date(value);
        }
        return value;
      });
  } catch {
    // On error, fetch the body.
  }
  if (!result || Date.now() - result.cachedAt > 60 * 60 * 1000) {
    result = {
      cachedAt: Date.now(),
      org, repo,
      issues: [],
      labelsPresent: false
    };

    for (const issue of await getIssues(octokit, org, repo)) {
      const info: IssueSummary = {
        number: issue.number,
        url: issue.html_url,
        title: issue.title,
        created_at: new Date(issue.created_at),
        labels: issue.labels?.map(label => label.name) ?? [],
      };
      if (issue.closed_at) {
        info.closed_at = new Date(issue.closed_at);
      }
      if (issue.pull_request) {
        info.pull_request = { draft: issue.pull_request.draft }
      }
      if (issue.milestone) {
        info.milestone = issue.milestone.title;
      }
      result.issues.push(info);
    }
  }

  const closeAgesMs: number[] = [];
  const openAgesMs: number[] = [];
  for (const issue of result.issues) {
    if (issue.closed_at) {
      closeAgesMs.push(issue.closed_at.valueOf() - issue.created_at.valueOf());
    } else {
      openAgesMs.push(result.cachedAt - issue.created_at.valueOf());
    }
  }
  result.ageAtCloseMs = ageStats(closeAgesMs);
  result.openAgeMs = ageStats(openAgesMs);
  globalStats.closeAgesMs.push(...closeAgesMs);
  globalStats.openAgesMs.push(...openAgesMs);

  await fs.mkdir(`summaries/${org}`, { recursive: true });
  await fs.writeFile(`summaries/${org}/${repo}.json`, JSON.stringify(result, undefined, 2));

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

  const globalStats: GlobalStatsInput = { openAgesMs: [], closeAgesMs: [] };
  await Promise.all(githubRepos.map(({ org, repo }) => analyzeRepo(org, repo, globalStats)));

  await fs.writeFile("summaries/global.json", JSON.stringify({
    ageAtCloseMs: ageStats(globalStats.closeAgesMs),
    openAgeMs: ageStats(globalStats.openAgesMs),
  }, undefined, 2));
}

await main();
