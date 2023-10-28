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
        props: { details: repo.data },
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
