import type { RepoJson } from "@lib/published-json";
import { RepoSummary } from "@lib/repo-summaries";
import { groupBySlo } from "@lib/slo";
import type {
    APIRoute,
    GetStaticPaths,
    InferGetStaticPropsType
} from "astro";
import { getCollection } from "astro:content";

export const getStaticPaths = (async () => {
    const repos = await getCollection("github")
    return repos.map((repo) => ({
        params: { org: repo.data.org, repo: repo.data.repo },
        props: { details: RepoSummary.parse(repo.data) },
    }));
}) satisfies GetStaticPaths;

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export const GET: APIRoute = ({ props }) => {
    const { details } = props as Props;
    const groups = groupBySlo(details.issues);
    const outOfSloObj: { outOfSlo?: boolean } = { outOfSlo: true };
    const summary = {
        repo: `${details.org}/${details.repo}`,
        summary: {
            retrieved: details.cachedAt,
            triageViolations: groups.triageViolations.length,
            urgentViolations: groups.urgentViolations.length,
            soonViolations: groups.soonViolations.length,
            agendaViolations: groups.agendaViolations.length,
            needTriage: groups.untriaged.length,
            urgent: groups.urgent.length,
            soon: groups.soon.length,
            agenda: groups.agenda.length,
            other: groups.other.length,
        },
        triage: groups.triageViolations.map(issue => Object.assign(issue, outOfSloObj)).concat(groups.untriaged),
        urgent: groups.urgentViolations.map(issue => Object.assign(issue, outOfSloObj)).concat(groups.urgent),
        soon: groups.soonViolations.map(issue => Object.assign(issue, outOfSloObj)).concat(groups.soon),
        agenda: groups.agendaViolations.map(issue => Object.assign(issue, outOfSloObj)).concat(groups.agenda),
        other: groups.other,
    } satisfies RepoJson;
    return new Response(JSON.stringify(summary));
}
