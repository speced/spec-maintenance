import { RepoSummary } from '@lib/repo-summaries.js';
import fs from 'node:fs/promises';
import { quantileSorted } from 'simple-statistics';

async function main() {
    const repoSummaries: { [name: string]: RepoSummary } = {};

    for (const org of await fs.readdir('../scanner/summaries')) {
        if (org.includes('.')) {
            continue;
        }
        for (const repoJson of await fs.readdir(`../scanner/summaries/${org}/`)) {
            if (!repoJson.endsWith('.json')) continue;
            const repo = repoJson.replace(/\.json$/, '');
            const content = await fs.readFile(`../scanner/summaries/${org}/${repoJson}`, { encoding: 'utf8' });
            repoSummaries[`${org}/${repo}`] = RepoSummary.parse(JSON.parse(content));
        }
    }

    const repoLabels: number[] = [];
    const repoIssues: number[] = [];
    const repoPRs: number[] = [];
    const issueLabels: number[] = [];
    const issueTimelineItems: number[] = [];
    const issueComments: number[] = [];

    for (const repo of Object.values(repoSummaries)) {
        if (repo.stats) {
            repoLabels.push(repo.stats.numLabels);
            repoIssues.push(repo.stats.numIssues);
            repoPRs.push(repo.stats.numPRs);
        }
        for (const issue of repo.issues) {
            if (issue.stats) {
                issueLabels.push(issue.stats.numLabels);
                issueTimelineItems.push(issue.stats.numTimelineItems);
                if (issue.stats.numComments) {
                    issueComments.push(issue.stats.numComments);
                }
            }
        }
    }

    function cmpNumber(a: number, b: number) { return a - b; }
    repoLabels.sort(cmpNumber);
    repoIssues.sort(cmpNumber);
    repoPRs.sort(cmpNumber);
    issueLabels.sort(cmpNumber);
    issueTimelineItems.sort(cmpNumber);
    issueComments.sort(cmpNumber);

    console.log('Distribution of the number of matching labels in a repository:');
    console.log(`Median: ${quantileSorted(repoLabels, .5)}`)
    console.log(`90%: ${quantileSorted(repoLabels, .9)}`)
    console.log(`Max: ${Math.max(...repoLabels)}\n`)

    console.log('Distribution of the number of issues in a repository:');
    console.log(`Median: ${quantileSorted(repoIssues, .5)}`)
    console.log(`90%: ${quantileSorted(repoIssues, .9)}`)
    console.log(`Max: ${Math.max(...repoIssues)}\n`)

    console.log('Distribution of the number of PRs in a repository:');
    console.log(`Median: ${quantileSorted(repoPRs, .5)}`)
    console.log(`90%: ${quantileSorted(repoPRs, .9)}`)
    console.log(`95%: ${quantileSorted(repoPRs, .95)}`)
    console.log(`99%: ${quantileSorted(repoPRs, .99)}`)
    console.log(`Max: ${Math.max(...repoPRs)}\n`)

    console.log('Distribution of the number of labels in an issue/PR:');
    console.log(`Median: ${quantileSorted(issueLabels, .5)}`)
    console.log(`90%: ${quantileSorted(issueLabels, .9)}`)
    console.log(`Max: ${Math.max(...issueLabels)}\n`)

    console.log('Distribution of the number of timeline items in an issue/PR:');
    console.log(`Median: ${quantileSorted(issueTimelineItems, .5)}`)
    console.log(`90%: ${quantileSorted(issueTimelineItems, .9)}`)
    console.log(`Max: ${Math.max(...issueTimelineItems)}\n`)

    console.log('Distribution of the number of comments/reviews in an issue/PR:');
    console.log(`Median: ${quantileSorted(issueComments, .5)}`)
    console.log(`90%: ${quantileSorted(issueComments, .9)}`)
    console.log(`95%: ${quantileSorted(issueComments, .95)}`)
    console.log(`99%: ${quantileSorted(issueComments, .99)}`)
    console.log(`Max: ${Math.max(...issueComments)}\n`)
}

await main();
