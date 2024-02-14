import { RepoSummary } from '@lib/repo-summaries';
import { groupBySlo } from '@lib/slo';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { stringify } from 'csv-stringify/sync';

export const GET: APIRoute = async () => {
    const repos = await getCollection("github");

    const repoSummaries = repos.map((repo) => {
        const repoData = RepoSummary.parse(repo.data);
        const groups = groupBySlo(repoData.issues);

        return {
            Repository: repo.id,
            Retrieved: repoData.cachedAt.round("second").toString(),
            'Need Triage': groups.untriaged.length,
            'Triage Violations': groups.triageViolations.length,
            Urgent: groups.urgent.length,
            'Urgent Violations': groups.urgentViolations.length,
            Soon: groups.soon.length,
            'Soon Violations': groups.soonViolations.length,
            Other: groups.other.length,
        };
    });

    return new Response(stringify(repoSummaries, { header: true }));
};
