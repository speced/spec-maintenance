import type { SummaryJson } from '@lib/published-json';
import { RepoSummary } from '@lib/repo-summaries';
import { groupBySlo } from '@lib/slo';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
    const repos = await getCollection("github");

    const repoSummaries = Object.fromEntries(repos.map((repo) => {
        const groups = groupBySlo(RepoSummary.parse(repo.data).issues);

        return [repo.id, {
            triageViolations: groups.triageViolations.length,
            urgentViolations: groups.urgentViolations.length,
            soonViolations: groups.soonViolations.length,
            agendaViolations: groups.agendaViolations.length,
            needsEditsViolations: groups.needsEditsViolations.length,
            needTriage: groups.untriaged.length,
            urgent: groups.urgent.length,
            soon: groups.soon.length,
            agenda: groups.agenda.length,
            needsEdits: groups.needsEdits.length,
            other: groups.other.length,
        }];
    })) satisfies SummaryJson;

    return new Response(JSON.stringify(repoSummaries));
};
