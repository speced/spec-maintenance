import { Temporal, toTemporalInstant } from '@js-temporal/polyfill';
import { z } from 'zod';

export const SloType = z.enum(["triage", "urgent", "important", "none"]);
export type SloType = z.infer<typeof SloType>;

const durationInMs = z.number().transform(val => Temporal.Duration.from({ milliseconds: Math.round(val) }));

export const IssueSummary = z.object({
    url: z.string().url(),
    title: z.string(),
    createdAt: z.coerce.date().transform(val => toTemporalInstant.call(val)),
    pull_request: z.object({ draft: z.boolean().default(false) }).optional(),
    labels: z.array(z.string()),
    sloTimeUsedMs: durationInMs,
    whichSlo: SloType,
    stats: z.object({
        numTimelineItems: z.number(),
        numComments: z.number().optional(),
        numLabels: z.number(),
    }).optional(),
})
export type IssueSummary = z.infer<typeof IssueSummary>;

export const RepoSummary = z.object({
    cachedAt: z.number().transform(val => Temporal.Instant.fromEpochMilliseconds(val)),
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
