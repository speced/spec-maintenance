// Defines constants and functions to check Github issue triage state.

import { Temporal } from "@js-temporal/polyfill";
import type { IssueSummary, SloType } from "./repo-summaries.js";

export const triageSLO = Temporal.Duration.from({ days: 7 });
export const urgentSLO = Temporal.Duration.from({ days: 14 });
export const soonSLO = Temporal.Duration.from({ days: 91 });
// A 5-week SLO to address something on the agenda allows a twice-a-month meeting to miss the item
// once.
export const agendaSLO = Temporal.Duration.from({ days: 35 });

export const sloMap = {
    "urgent": urgentSLO,
    "soon": soonSLO,
    "triage": triageSLO
} as const;

export interface SloStatus {
    whichSlo: SloType;
    withinSlo: boolean;
    onAgenda: boolean;
    onAgendaTooLong: boolean;
};

export function slo(issue: Pick<IssueSummary, "whichSlo" | "sloTimeUsed" | "onAgendaFor">): SloStatus {
    const onAgenda = issue.onAgendaFor !== undefined;
    const onAgendaTooLong = issue.onAgendaFor !== undefined &&
        Temporal.Duration.compare(issue.onAgendaFor, agendaSLO) > 0;
    if (issue.whichSlo === "none") {
        return { whichSlo: "none", withinSlo: true, onAgenda, onAgendaTooLong };
    }
    const slo = sloMap[issue.whichSlo];

    return {
        whichSlo: issue.whichSlo,
        withinSlo:
            Temporal.Duration.compare(issue.sloTimeUsed, slo) < 0,
        onAgenda,
        onAgendaTooLong,
    };
}

export function cmpByTimeUsed(a: IssueSummary, b: IssueSummary) {
    return Temporal.Duration.compare(b.sloTimeUsed, a.sloTimeUsed);
}
const zeroDuration = Temporal.Duration.from({ seconds: 0 });
export function cmpByAgendaUsed(a: IssueSummary, b: IssueSummary) {
    return Temporal.Duration.compare(b.onAgendaFor ?? zeroDuration, a.onAgendaFor ?? zeroDuration);
}

export interface SloGroups {
    untriaged: IssueSummary[];
    urgent: IssueSummary[];
    soon: IssueSummary[];
    agenda: IssueSummary[];
    triageViolations: IssueSummary[];
    urgentViolations: IssueSummary[];
    soonViolations: IssueSummary[];
    agendaViolations: IssueSummary[];
    other: IssueSummary[];
}
export function groupBySlo(issues: IssueSummary[]): SloGroups {
    const result: SloGroups = {
        untriaged: [],
        urgent: [],
        soon: [],
        agenda: [],
        triageViolations: [],
        urgentViolations: [],
        soonViolations: [],
        agendaViolations: [],
        other: [],
    };
    for (const issue of issues) {
        const { whichSlo, withinSlo, onAgenda, onAgendaTooLong } = slo(issue);
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
        if (onAgendaTooLong) {
            result.agendaViolations.push(issue);
        } else if (onAgenda) {
            result.agenda.push(issue);
        }
    }
    for (const [key, list] of Object.entries(result)) {
        if (key.startsWith('agenda')) {
            list.sort(cmpByAgendaUsed);
        } else {
            list.sort(cmpByTimeUsed);
        }
    }
    return result;
}
