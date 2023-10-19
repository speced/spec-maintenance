import { Temporal, toTemporalInstant } from '@js-temporal/polyfill';
import { z } from 'zod';

export const IssueSummary = z.object({
    url: z.string().url(),
    title: z.string(),
    created_at: z.coerce.date().transform(val => toTemporalInstant.call(val)),
    closed_at: z.coerce.date().transform(val => toTemporalInstant.call(val)).optional(),
    pull_request: z.object({ draft: z.boolean().default(false) }).optional(),
    milestone: z.string().optional(),
    labels: z.array(z.string()),
    ageAtCloseMs: z.number().optional(),
    firstCommentLatencyMs: z.number().optional(),
})
export type IssueSummary = z.infer<typeof IssueSummary>;

const durationInMs = z.number().transform(val => Temporal.Duration.from({ milliseconds: Math.round(val) }));

export const AgeStats = z.object({
    count: z.number(),
    mean: durationInMs,
    10: durationInMs,
    25: durationInMs,
    50: durationInMs,
    75: durationInMs,
    90: durationInMs,
});
export type AgeStats = z.infer<typeof AgeStats>;

export const RepoSummary = z.object({
    cachedAt: z.number().transform(val => Temporal.Instant.fromEpochMilliseconds(val)),
    org: z.string(),
    repo: z.string(),
    issues: IssueSummary.array(),
    labelsPresent: z.boolean(),
    ageAtCloseMs: AgeStats.optional(),
    openAgeMs: AgeStats.optional(),
    firstCommentLatencyMs: AgeStats.optional(),
    openFirstCommentLatencyMs: AgeStats.optional(),
    closedFirstCommentLatencyMs: AgeStats.optional(),
});
export type RepoSummary = z.infer<typeof RepoSummary>;
