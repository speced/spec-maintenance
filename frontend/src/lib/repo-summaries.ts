import { z } from 'zod';
import { checkDuration, checkInstant, duration, instant } from './zod-helpers.js';

export const SloType = z.enum(["triage", "urgent", "soon", "none"]);
export type SloType = z.infer<typeof SloType>;


export const IssueSummaryInContent = z.object({
    url: z.string().url(),
    title: z.string(),
    author: z.string().optional(),
    createdAt: checkInstant,
    pull_request: z.object({ draft: z.boolean().default(false) }).optional(),
    labels: z.array(z.string()),
    milestone: z.object({
        url: z.string().url(),
        title: z.string(),
    }).optional(),
    sloTimeUsed: checkDuration,
    whichSlo: SloType,
    stats: z.object({
        numTimelineItems: z.number(),
        numComments: z.number().optional(),
        numLabels: z.number(),
    }).optional(),
})
export type IssueSummaryInContent = z.infer<typeof IssueSummaryInContent>;

export const IssueSummary = IssueSummaryInContent.extend({
    createdAt: instant,
    sloTimeUsed: duration,
});
export type IssueSummary = z.infer<typeof IssueSummary>;

export const RepoSummaryInContent = z.object({
    cachedAt: checkInstant,
    org: z.string(),
    repo: z.string(),
    issues: IssueSummaryInContent.array(),
    labelsPresent: z.boolean(),
    stats: z.object({
        numLabels: z.number(),
        numIssues: z.number(),
        numPRs: z.number(),
    }).optional(),
});
export type RepoSummaryInContent = z.infer<typeof RepoSummaryInContent>;

export const RepoSummary = RepoSummaryInContent.extend({
    cachedAt: instant,
    issues: IssueSummary.array(),
});
export type RepoSummary = z.infer<typeof RepoSummary>;
