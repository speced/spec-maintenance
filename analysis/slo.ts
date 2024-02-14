import { Temporal } from '@js-temporal/polyfill';
import { RepoSummary, SloType } from '@lib/repo-summaries.js';
import fs from 'node:fs/promises';

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
    let sloTypes: { [type in SloType]: number } = { "triage": 0, "none": 0, "soon": 0, "urgent": 0 };
    let exceededTriageSLO = 0;
    let outOfTriageSLO = 0;
    let outOfUrgentSLO = 0;
    let outOfSoonSLO = 0;

    const triageSLO = Temporal.Duration.from({ days: 7 });
    const urgentSLO = Temporal.Duration.from({ days: 14 });
    const soonSLO = Temporal.Duration.from({ days: 91 });

    for (const repo of Object.values(repoSummaries)) {
        const scannedAt = repo.cachedAt;
        for (const issue of repo.issues) {
            totalIssues++;

            sloTypes[issue.whichSlo]++;

            if (issue.whichSlo === "urgent" &&
                Temporal.Duration.compare(issue.sloTimeUsed, urgentSLO) > 0) {
                outOfUrgentSLO++;
            }
            if (issue.whichSlo === "soon" &&
                Temporal.Duration.compare(issue.sloTimeUsed, soonSLO) > 0) {
                outOfSoonSLO++;
            }
            if (issue.whichSlo === "triage" &&
                Temporal.Duration.compare(issue.sloTimeUsed, triageSLO) > 0) {
                outOfTriageSLO++;
            }
        }
    }

    console.log(`Of ${totalIssues} total issues, ${sloTypes["none"]} (${(sloTypes["none"] / totalIssues * 100).toPrecision(2)}%) have no SLO.`);
    console.log(`Of ${sloTypes["triage"]} issues that need triage, ${outOfTriageSLO} (${(outOfTriageSLO / sloTypes["triage"] * 100).toPrecision(2)}%) are out of SLO.`);
}


await main();
