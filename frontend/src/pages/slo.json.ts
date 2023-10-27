import { RepoSummary } from '@lib/repo-summaries';
import { groupBySlo } from '@lib/slo';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, request }) => {
    const repos = Object.values(await import.meta.glob("../../../scanner/summaries/*/*.json", { eager: true })).map(
        (repo) => RepoSummary.parse(repo)
    );

    const repoSummaries = Object.fromEntries(repos.map((repo) => {
        const groups = groupBySlo(repo.issues);

        return [`${repo.org}/${repo.repo}`, {
            triageViolations: groups.triageViolations.length,
            urgentViolations: groups.urgentViolations.length,
            importantViolations: groups.importantViolations.length,
            needTriage: groups.untriaged.length,
            urgent: groups.urgent.length,
            important: groups.important.length,
            other: groups.other.length,
        }];
    }));

    return new Response(JSON.stringify(repoSummaries));
};
