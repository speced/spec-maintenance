import { IssueOrPr } from "./github.js";

function cssTriagePredicate (issue: Pick<IssueOrPr, 'labels'>) {
    return issue.labels.nodes.length > 0;
}

const triagePredicates: Record<`${string}/${string}`, (issue: Pick<IssueOrPr, 'labels'>) => boolean> = {
    'w3c/css-houdini-drafts': cssTriagePredicate,
    'w3c/csswg-drafts': cssTriagePredicate,
    'w3c/fxtf-drafts': cssTriagePredicate,
};

// True if this repository has configured a custom function to say whether an issue is triaged
// without an SLO, instead of the common `Priority: Eventually` label.
export function hasTriagePredicate(repoNameWithOwner: string) {
    return repoNameWithOwner in triagePredicates;
}

// True if this issue should be considered triaged without an SLO.
export function isTriaged(repoNameWithOwner: string, issue: Pick<IssueOrPr, 'labels'>): boolean {
    return triagePredicates[repoNameWithOwner]?.(issue);
}
