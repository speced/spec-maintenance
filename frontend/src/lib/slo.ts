// Defines constants and functions to check Github issue triage state.

import { Temporal } from "@js-temporal/polyfill";
import type { IssueSummary, SloType } from "./repo-summaries.js";

const triageSLO = Temporal.Duration.from({ days: 7 });
const urgentSLO = Temporal.Duration.from({ days: 14 });
const soonSLO = Temporal.Duration.from({ days: 91 });

export const sloMap = {
    "urgent": urgentSLO,
    "soon": soonSLO,
    "triage": triageSLO
} as const;

export interface SloStatus {
    whichSlo: SloType;
    withinSlo: boolean;
};

export function slo(issue: Pick<IssueSummary, "whichSlo"|"sloTimeUsed">): SloStatus {
    if (issue.whichSlo === "none") {
        return { whichSlo: "none", withinSlo: true };
    }
    const slo = sloMap[issue.whichSlo];

    return {
        whichSlo: issue.whichSlo,
        withinSlo:
            Temporal.Duration.compare(issue.sloTimeUsed, slo) < 0
    };
}

export function cmpByTimeUsed(a: IssueSummary, b: IssueSummary) {
    return Temporal.Duration.compare(b.sloTimeUsed, a.sloTimeUsed);
}

export interface SloGroups {
    untriaged: IssueSummary[];
    urgent: IssueSummary[];
    soon: IssueSummary[];
    triageViolations: IssueSummary[];
    urgentViolations: IssueSummary[];
    soonViolations: IssueSummary[];
    other: IssueSummary[];
}
export function groupBySlo(issues: IssueSummary[]): SloGroups {
    const result: SloGroups = {
        untriaged: [],
        urgent: [],
        soon: [],
        triageViolations: [],
        urgentViolations: [],
        soonViolations: [],
        other: [],
    };
    for (const issue of issues) {
        const { whichSlo, withinSlo } = slo(issue);
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
    }
    for (const list of Object.values(result)) {
        list.sort(cmpByTimeUsed);
    }
    return result;
}
