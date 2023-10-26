import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';

export const SloType = z.enum(["triage", "urgent", "important", "none"]);
export type SloType = z.infer<typeof SloType>;

const duration = z.string().transform(val => Temporal.Duration.from(val));
const instant = z.string().transform(val => Temporal.Instant.from(val));

export const IssueSummary = z.object({
    url: z.string().url(),
    title: z.string(),
    createdAt: instant,
    pull_request: z.object({ draft: z.boolean().default(false) }).optional(),
    labels: z.array(z.string()),
    sloTimeUsed: duration,
    whichSlo: SloType,
    stats: z.object({
        numTimelineItems: z.number(),
        numComments: z.number().optional(),
        numLabels: z.number(),
    }).optional(),
})
export type IssueSummary = z.infer<typeof IssueSummary>;

export const RepoSummary = z.object({
    cachedAt: instant,
    org: z.string(),
    repo: z.string(),
    issues: IssueSummary.array(),
    labelsPresent: z.boolean(),
    stats: z.object({
        numLabels: z.number(),
        numIssues: z.number(),
        numPRs: z.number(),
    }).optional(),
});
export type RepoSummary = z.infer<typeof RepoSummary>;
