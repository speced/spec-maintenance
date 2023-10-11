import Bottleneck from "bottleneck";
import specs from 'browser-specs' assert { type: "json" };
import fs from 'node:fs/promises';
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
};

interface RepoSummary {
  cached_at: number;
  org: string;
  repo: string;
  issues: IssueSummary[];
  labelsPresent: boolean;
}

async function analyzeRepo(org: string, repo: string): Promise<RepoSummary> {
  try {
    const cachedRepo = JSON.parse(await fs.readFile(`summaries/${org}/${repo}.json`, { encoding: 'utf8' }));
    if (Date.now() - cachedRepo.cached_at < 60 * 60 * 1000) {
      return cachedRepo;
    }
  } catch {
    // On error, fetch the body.
  }
  const result: RepoSummary = {
    cached_at: Date.now(),
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

    await fs.mkdir(`summaries/${org}`, { recursive: true });
    await fs.writeFile(`summaries/${org}/${repo}.json`, JSON.stringify(result, undefined, 2));
  }
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
  await Promise.all(githubRepos.map(({ org, repo }) => analyzeRepo(org, repo)));
}

await main();
