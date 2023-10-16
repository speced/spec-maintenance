// Defines constants and functions to check Github issue triage state.

import type { IssueSummary } from "./repo-summaries";

export const PRIORITY_URGENT = "Priority: Urgent";
export const PRIORITY_IMPORTANT = "Priority: Important";
export const PRIORITY_EVENTUALLY = "Priority: Eventually";
export const NEEDS_REPORTER_FEEDBACK = "Needs Reporter Feedback";
export const BLOCKS_IMPLEMENTATION = "Blocks Implementation";

export function triaged(issue: IssueSummary) {
    return [PRIORITY_URGENT, PRIORITY_IMPORTANT, PRIORITY_EVENTUALLY
    ].some(priority => issue.labels.includes(priority));
    // TODO: Should issues go back to untriaged if they "need reporter feedback" and the reporter
    // comments? Then they're untriaged until someone else (a repo member?) comments?
}

/**
 * @returns true if the issue is inside its SLO, which depends on the issue's labels.
 */
export function meetsSLO(issue: IssueSummary) {

}
