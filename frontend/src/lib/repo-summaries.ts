import { Temporal, toTemporalInstant } from '@js-temporal/polyfill';
import { z } from 'zod';

export const IssueSummary = z.object({
    number: z.number(),
    url: z.string().url(),
    title: z.string(),
    created_at: z.coerce.date().transform(val => toTemporalInstant.call(val)),
    closed_at: z.coerce.date().transform(val => toTemporalInstant.call(val)).optional(),
    pull_request: z.object({ draft: z.boolean().default(false) }).optional(),
    milestone: z.string().optional(),
    labels: z.array(z.string()),
    ageAtCloseMs: z.number().optional(),
})

export type IssueSummary = z.infer<typeof IssueSummary>;

export const AgeStats = z.object({
    count: z.number(),
    mean: z.number().transform(val => Temporal.Duration.from({ milliseconds: Math.round(val) })),
}).catchall(/*percentiles*/ z.number().transform(val => Temporal.Duration.from({ milliseconds: val })));
export type AgeStats = z.infer<typeof AgeStats>;

export const RepoSummary = z.object({
    cachedAt: z.number().transform(val => Temporal.Instant.fromEpochMilliseconds(val)),
    org: z.string(),
    repo: z.string(),
    issues: IssueSummary.array(),
    labelsPresent: z.boolean(),
    ageAtCloseMs: AgeStats.optional(),
    openAgeMs: AgeStats.optional(),
});
export type RepoSummary = z.infer<typeof RepoSummary>;
