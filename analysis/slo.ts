import { Temporal } from '@js-temporal/polyfill';
import fs from 'node:fs/promises';
import { RepoSummary } from '../frontend/src/lib/repo-summaries.js';

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

    let totalIssues = 0;
    let openIssues = 0;
    let exceededTriageSLO = 0;
    let outOfTriageSLO = 0;
    let outOfUrgentSLO = 0;
    let outOfImportantSLO = 0;

    const triageSLO = Temporal.Duration.from({ days: 7 });
    const urgentSLO = Temporal.Duration.from({ days: 14 });
    const importantSLO = Temporal.Duration.from({ days: 91 });

    for (const repo of Object.values(repoSummaries)) {
        const scannedAt = repo.cachedAt;
        for (const issue of repo.issues) {
            if (issue.closed_at && issue.pull_request && !issue.firstCommentLatencyMs) {
                continue;
            }
            totalIssues++;
            if (!issue.closed_at) {
                openIssues++;
            } else {
                if (
                    Temporal.Duration.compare(issue.created_at.until(issue.closed_at),
                        urgentSLO) > 0) {
                    outOfUrgentSLO++;
                }
                if (
                    Temporal.Duration.compare(issue.created_at.until(issue.closed_at),
                        importantSLO) > 0) {
                    outOfImportantSLO++;
                }
            }
            if (issue.firstCommentLatencyMs) {
                if (
                    Temporal.Duration.compare({ milliseconds: issue.firstCommentLatencyMs },
                        triageSLO) > 0) {
                    exceededTriageSLO++;
                }
            } else {
                // No comments yet.
                if (issue.closed_at) {
                    // Treat the time the issue was closed as the time it was triaged.
                    if (
                        Temporal.Duration.compare(issue.created_at.until(issue.closed_at),
                            triageSLO) > 0) {
                        exceededTriageSLO++;
                    }
                }
                else {
                    if (Temporal.Duration.compare(issue.created_at.until(scannedAt), triageSLO) > 0) {
                        outOfTriageSLO++;
                    }
                }
            }
        }
    }

    const closedIssues = totalIssues - openIssues;
    console.log(`Of ${totalIssues} total issues, ${exceededTriageSLO} ever exceeded a ${triageSLO} triage SLO.`);
    console.log(`Of ${openIssues} open issues, ${outOfTriageSLO} are out of SLO now.`);
    console.log(`Of ${closedIssues} closed issues, ${outOfUrgentSLO} (${(outOfUrgentSLO / closedIssues * 100).toPrecision(2)}%) exceeded the 14-day "urgent" SLO.`);
    console.log(`Of ${closedIssues} closed issues, ${outOfImportantSLO} (${(outOfImportantSLO / closedIssues * 100).toPrecision(2)}%) exceeded the 91-day "important" SLO.`);
}

await main();
