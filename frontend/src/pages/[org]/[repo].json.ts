import { RepoSummary } from "@lib/repo-summaries";
import { groupBySlo } from "@lib/slo";
import type {
    APIRoute,
    GetStaticPaths,
    InferGetStaticPropsType
} from "astro";

export const getStaticPaths = (async () => {
    const repos = RepoSummary.array().parse(
        Object.values(await import.meta.glob("../../../../scanner/summaries/*/*.json", { eager: true }))
    );
    return repos.map((repo) => ({
        params: { org: repo.org, repo: repo.repo },
        props: { details: repo },
    }));
}) satisfies GetStaticPaths;

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export const GET: APIRoute = ({ props }) => {
    const { details } = props as Props;
    const groups = groupBySlo(details.issues);
    return new Response(
        JSON.stringify({
            triageViolations: groups.triageViolations.length,
            urgentViolations: groups.urgentViolations.length,
            importantViolations: groups.importantViolations.length,
            needTriage: groups.untriaged.length,
            urgent: groups.urgent.length,
            important: groups.important.length,
            other: groups.other.length,
        }));
}
