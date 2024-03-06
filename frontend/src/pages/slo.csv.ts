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
            'Agenda Violations': groups.agendaViolations.length,
            'Editing Violations': groups.needsEditsViolations.length,
            Urgent: groups.urgent.length,
            'Urgent Violations': groups.urgentViolations.length,
            Soon: groups.soon.length,
            'Soon Violations': groups.soonViolations.length,
            Agenda: groups.agenda.length,
            'Need Edits': groups.needsEdits.length,
            Other: groups.other.length,
        };
    });

    return new Response(stringify(repoSummaries, { header: true }));
};
