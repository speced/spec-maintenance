import z from 'zod';
import { IssueSummary } from './repo-summaries.js';
import { instant } from './zod-helpers.js';

export const SummaryJson = z.object({}).catchall(z.object({
        triageViolations: z.number(),
        urgentViolations: z.number(),
        soonViolations: z.number(),
        agendaViolations: z.number(),
        needTriage: z.number(),
        urgent: z.number(),
        soon: z.number(),
        agenda: z.number(),
        other: z.number(),
    }));
export type SummaryJson = z.infer<typeof SummaryJson>;

const IssueSummaryWithSlo = IssueSummary.extend({ outOfSlo: z.boolean().optional() });

export const RepoJson = z.object({
    repo: z.string(),
    summary: z.object({
        retrieved: instant,
        triageViolations: z.number(),
        urgentViolations: z.number(),
        soonViolations: z.number(),
        agendaViolations: z.number(),
        needTriage: z.number(),
        urgent: z.number(),
        soon: z.number(),
        agenda: z.number(),
        other: z.number(),
    }),
    triage: IssueSummaryWithSlo.array(),
    urgent: IssueSummaryWithSlo.array(),
    soon: IssueSummaryWithSlo.array(),
    agenda: IssueSummaryWithSlo.array(),
    other: IssueSummaryWithSlo.array(),
});
export type RepoJson = z.infer<typeof RepoJson>;
