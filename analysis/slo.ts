import { Temporal } from '@js-temporal/polyfill';
import fs from 'node:fs/promises';
import { RepoSummary, SloType } from '../frontend/src/lib/repo-summaries.js';

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
    let sloTypes: { [type in SloType]: number } = { "triage": 0, "none": 0, "important": 0, "urgent": 0 };
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
            totalIssues++;

            sloTypes[issue.whichSlo]++;

            if (issue.whichSlo === "urgent" &&
                Temporal.Duration.compare(issue.sloTimeUsedMs, urgentSLO) > 0) {
                outOfUrgentSLO++;
            }
            if (issue.whichSlo === "important" &&
                Temporal.Duration.compare(issue.sloTimeUsedMs, importantSLO) > 0) {
                outOfImportantSLO++;
            }
            if (issue.whichSlo === "triage" &&
                Temporal.Duration.compare(issue.sloTimeUsedMs, triageSLO) > 0) {
                outOfTriageSLO++;
            }
        }
    }

    console.log(`Of ${totalIssues} total issues, ${sloTypes["none"]} (${(sloTypes["none"] / totalIssues * 100).toPrecision(2)}%) have no SLO.`);
    console.log(`Of ${sloTypes["triage"]} issues that need triage, ${outOfTriageSLO} (${(outOfTriageSLO / sloTypes["triage"] * 100).toPrecision(2)}%) are out of SLO.`);
}


await main();
