// Defines constants and functions to check Github issue triage state.

import { Temporal } from "@js-temporal/polyfill";
import type { IssueSummary, SloType } from "./repo-summaries.js";

export const triageSLO = Temporal.Duration.from({ days: 7 });
export const urgentSLO = Temporal.Duration.from({ days: 14 });
export const soonSLO = Temporal.Duration.from({ days: 91 });
// A 5-week SLO to address something on the agenda allows a twice-a-month meeting to miss the item
// once.
export const agendaSLO = Temporal.Duration.from({ days: 35 });
export const editsSLO = Temporal.Duration.from({ days: 14 });

// Keep to at most 25 agenda items.
export const agendaLengthSLO = 25;

export const sloMap = {
    "urgent": urgentSLO,
    "soon": soonSLO,
    "triage": triageSLO
} as const;

type CategoryInfo = {
    timeUsed: Temporal.Duration;
    // This is positive if the issue is within this category's SLO, or negative by the amount the
    // issue is out-of-SLO.
    untilSlo: Temporal.Duration;
};

export interface SloStatus {
    whichSlo: SloType;
    withinSlo: boolean;
    // This is undefined if the issue has no SLO, positive if the issue is within its priority's
    // SLO, or negative by the amount the issue is out-of-SLO.
    untilSlo?: Temporal.Duration;
    // When an issue is in a particular category, that key will be present.
    categories: {
        agenda?: CategoryInfo
        needsEdits?: CategoryInfo
    }
};

export function slo(issue: Pick<IssueSummary, "whichSlo" | "sloTimeUsed" | "onAgendaFor" | "neededEditsFor">): SloStatus {
    let categories: SloStatus["categories"] = {};
    if (issue.onAgendaFor) {
        categories.agenda = {
            timeUsed: issue.onAgendaFor,
            untilSlo: agendaSLO.subtract(issue.onAgendaFor),
        };
    }
    if (issue.neededEditsFor) {
        categories.needsEdits = {
            timeUsed: issue.neededEditsFor,
            untilSlo: editsSLO.subtract(issue.neededEditsFor),
        }
    }
    if (issue.whichSlo === "none") {
        return { whichSlo: "none", withinSlo: true, categories };
    }
    const slo = sloMap[issue.whichSlo];

    const untilSlo = slo.subtract(issue.sloTimeUsed);
    return {
        whichSlo: issue.whichSlo,
        untilSlo,
        withinSlo: untilSlo.sign > 0,
        categories,
    };
}

export function cmpByTimeUsed(a: IssueSummary, b: IssueSummary) {
    return Temporal.Duration.compare(b.sloTimeUsed, a.sloTimeUsed);
}
const zeroDuration = Temporal.Duration.from({ seconds: 0 });
export function cmpByAgendaUsed(a: IssueSummary, b: IssueSummary) {
    return Temporal.Duration.compare(b.onAgendaFor ?? zeroDuration, a.onAgendaFor ?? zeroDuration);
}
export function cmpByNeededEditsFor(a: IssueSummary, b: IssueSummary) {
    return Temporal.Duration.compare(b.neededEditsFor ?? zeroDuration, a.neededEditsFor ?? zeroDuration);
}

export interface SloGroups {
    untriaged: IssueSummary[];
    urgent: IssueSummary[];
    soon: IssueSummary[];
    agenda: IssueSummary[];
    needsEdits: IssueSummary[];
    triageViolations: IssueSummary[];
    urgentViolations: IssueSummary[];
    soonViolations: IssueSummary[];
    agendaViolations: IssueSummary[];
    needsEditsViolations: IssueSummary[];
    other: IssueSummary[];
}
export function groupBySlo(issues: IssueSummary[]): SloGroups {
    const result: SloGroups = {
        untriaged: [],
        urgent: [],
        soon: [],
        agenda: [],
        needsEdits: [],
        triageViolations: [],
        urgentViolations: [],
        soonViolations: [],
        agendaViolations: [],
        needsEditsViolations: [],
        other: [],
    };
    for (const issue of issues) {
        const { whichSlo, withinSlo, categories: { agenda, needsEdits } } = slo(issue);
        switch (whichSlo) {
            case "urgent":
                if (withinSlo) {
                    result.urgent.push(issue);
                } else {
                    result.urgentViolations.push(issue);
                }
                break;
            case "soon":
                if (withinSlo) {
                    result.soon.push(issue);
                } else {
                    result.soonViolations.push(issue);
                }
                break;
            case "triage":
                if (withinSlo) {
                    result.untriaged.push(issue);
                } else {
                    result.triageViolations.push(issue);
                }
                break;
            default:
                result.other.push(issue);
                break;
        }
        if (agenda) {
            if (agenda.untilSlo.sign < 0) {
                result.agendaViolations.push(issue);
            } else {
                result.agenda.push(issue);
            }
        }
        if (needsEdits){
            if (needsEdits.untilSlo.sign < 0) {
                result.needsEditsViolations.push(issue);
            } else {
                result.needsEdits.push(issue);
            }
        }
    }
    for (const [key, list] of Object.entries(result)) {
        if (key.startsWith('agenda')) {
            list.sort(cmpByAgendaUsed);
        } else if (key.startsWith('needsEdits')) {
            list.sort(cmpByNeededEditsFor);
        } else {
            list.sort(cmpByTimeUsed);
        }
    }
    return result;
}
