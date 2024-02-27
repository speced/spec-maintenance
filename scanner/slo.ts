import { Temporal } from "@js-temporal/polyfill";
import { SloType } from '@lib/repo-summaries.js';
import assert from "node:assert";
import type { IssueOrPr, Repository } from "./github.js";

const PRIORITY_URGENT = "priority: urgent";
const PRIORITY_SOON = "priority: soon";
const PRIORITY_EVENTUALLY = "priority: eventually";
const AGENDA = "agenda+";
const NEEDS_REPORTER_FEEDBACK = "needs reporter feedback";
export function NeedsReporterFeedback(label: string) {
  return label.toLowerCase() === NEEDS_REPORTER_FEEDBACK;
}

/** Returns whether `repo` has enough labels to mark bugs as triaged.
 *
 * Because different repositories will adopt different subsets of the labels this tool recognizes,
 * we should only look for the smallest subset that indicates the repo isn't relying on the triage
 * heuristics. For now, that's just the `Priority: Eventually` label.
 */
export function hasLabels(repo: Pick<Repository, 'labels'>): boolean {
  return repo.labels.nodes.some(labelNode => labelNode.name === PRIORITY_EVENTUALLY);
}

export function whichSlo(issue: Pick<IssueOrPr, 'labels' | 'isDraft'>): SloType {
  const labels: string[] = issue.labels.nodes.map(label => label.name.toLowerCase());
  if (issue.isDraft || labels.includes(PRIORITY_EVENTUALLY) || labels.includes(NEEDS_REPORTER_FEEDBACK)) {
    return "none";
  }
  if (labels.includes(PRIORITY_URGENT)) {
    return "urgent";
  }
  if (labels.includes(PRIORITY_SOON)) {
    return "soon";
  }
  return "triage";
}

function anyLabelAppliesSlo(labelsLowercase: Set<string>, slo: SloType): boolean {
  let acceptedLabels: string[];
  switch (slo) {
    case "none": return false;
    case "triage": return true;
    case "soon":
      acceptedLabels = [PRIORITY_SOON, PRIORITY_URGENT]
      break;
    case "urgent":
      acceptedLabels = [PRIORITY_URGENT];
      break;
  }
  return acceptedLabels.some(label => labelsLowercase.has(label));
}

export function countSloTime(
  issue: Pick<IssueOrPr, 'createdAt' | 'author' | 'timelineItems'>,
  now: Temporal.Instant,
  slo: SloType,
): Temporal.Duration {
  let timeUsed = Temporal.Duration.from({ seconds: 0 });
  type PauseReason = "draft" | "need-feedback" | "closed" | "no-slo-label";
  const pauseReason = new Set<PauseReason>();
  const activeLabelsLowercase = new Set<string>();
  if (!anyLabelAppliesSlo(activeLabelsLowercase, slo)) {
    pauseReason.add("no-slo-label");
  }
  let draftChanged = false;
  let sloStartTime = Temporal.Instant.from(issue.createdAt);

  for (const timelineItem of issue.timelineItems.nodes) {
    function pause(reason: PauseReason) {
      if (pauseReason.size === 0) {
        timeUsed = timeUsed.add(sloStartTime.until(timelineItem.createdAt!));
      }
      pauseReason.add(reason);
    }
    function unpause(reason: PauseReason) {
      const deleted = pauseReason.delete(reason);
      if (pauseReason.size === 0 && deleted) {
        sloStartTime = Temporal.Instant.from(timelineItem.createdAt!);
      }
    }
    switch (timelineItem.__typename) {
      case 'ReadyForReviewEvent':
        if (!draftChanged) {
          // If the first change in draft status is to become ready for review, then the SLO must
          // have been paused for all previous events.
          timeUsed = Temporal.Duration.from({ seconds: 0 });
          sloStartTime = Temporal.Instant.from(timelineItem.createdAt!);
          draftChanged = true;
        }
        unpause("draft");
        break;
      case 'ConvertToDraftEvent':
        draftChanged = true;
        pause("draft");
        break;
      case 'LabeledEvent':
        activeLabelsLowercase.add(timelineItem.label.name.toLowerCase());
        if (NeedsReporterFeedback(timelineItem.label.name)) {
          pause("need-feedback");
        }
        if (anyLabelAppliesSlo(activeLabelsLowercase, slo)) {
          unpause("no-slo-label");
        }
        break;
      case 'UnlabeledEvent':
        activeLabelsLowercase.delete(timelineItem.label.name.toLowerCase());
        if (NeedsReporterFeedback(timelineItem.label.name)) {
          unpause("need-feedback");
        }
        if (!anyLabelAppliesSlo(activeLabelsLowercase, slo)) {
          pause("no-slo-label");
        }
        break;
      case 'ClosedEvent':
        pause("closed");
        break;
      case 'ReopenedEvent':
        unpause("closed");
        break;
      case 'IssueComment':
      case 'PullRequestReview':
      case 'PullRequestReviewThread':
        if (timelineItem.author?.login === issue.author?.login) {
          unpause("need-feedback");
        }
        break;
    }
  }
  if (pauseReason.size === 0) {
    timeUsed = timeUsed.add(sloStartTime.until(now));
  }
  return timeUsed.round({ largestUnit: 'days' });
}


/**
 * Returns how long `issue` has been on the agenda, or `undefined` if it's not on the agenda.
 *
 * This counts from the most recent time that the Agenda+ label was added, since an issue can be
 * added to the agenda multiple times, and it's not "late" this time just because the previous time
 * took a while to handle.
 */
export function countAgendaTime(issue: Pick<IssueOrPr, 'url' | 'labels' | 'timelineItems'>,
  now: Temporal.Instant): undefined | Temporal.Duration {
  if (!issue.labels.nodes.some(label => label.name.toLowerCase() === AGENDA)) {
    return undefined;
  }
  const agendaAddEvent = issue.timelineItems.nodes.findLast(timelineItem =>
    timelineItem.__typename === 'LabeledEvent' &&
    timelineItem.label.name.toLowerCase() === AGENDA);
  if (agendaAddEvent === undefined) {
    throw new Error(
      `Issue ${issue.url} has an Agenda+ label but no timeline item adding that label.`,
      { cause: issue });
  }
  assert.strictEqual(agendaAddEvent.__typename, 'LabeledEvent');
  return agendaAddEvent.createdAt.until(now).round({ largestUnit: 'days' });
}
