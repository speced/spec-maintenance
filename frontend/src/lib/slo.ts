// Defines constants and functions to check Github issue triage state.

import { Temporal } from "@js-temporal/polyfill";
import type { IssueSummary, SloType } from "./repo-summaries";

const triageSLO = Temporal.Duration.from({ days: 7 });
const urgentSLO = Temporal.Duration.from({ days: 14 });
const importantSLO = Temporal.Duration.from({ days: 91 });

const sloMap = {
    "urgent": urgentSLO,
    "important": importantSLO,
    "triage": triageSLO
} as const;

export interface SloStatus {
    whichSlo: SloType;
    withinSlo: boolean;
};

export function slo(issue: IssueSummary): SloStatus {
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
