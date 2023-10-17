import type { Temporal } from '@js-temporal/polyfill';

/**
 * This rounds {@link age} to a single unit and formats it into a string.
 *
 * It estimates month and year lengths rather than relying on a `relativeTo` point in time, because
 * issue ages all start and end at different times.
 *
 * Someday I'll be able to migrate this to Intl.DurationFormat.
 */
export function formatRoundAge(age: Temporal.Duration): string {
    const totalDays = age.total('day');
    if (totalDays > 336) {
        const roundYears = Math.round(totalDays / 365.24 * 10) / 10;
        return `${roundYears} year${roundYears === 1 ? '' : 's'}`;
    } else if (totalDays > 28) {
        const roundMonths = Math.round(totalDays / 30.4 * 10) / 10;
        return `${roundMonths} month${roundMonths === 1 ? '' : 's'}`;
    } else if (totalDays > 6) {
        const roundWeeks = Math.round(totalDays / 7 * 10) / 10;
        return `${roundWeeks} week${roundWeeks === 1 ? '' : 's'}`;
    } else if (totalDays > 23 / 24) {
        const roundDays = Math.round(totalDays);
        return `${roundDays} day${roundDays === 1 ? '' : 's'}`;
    } else if (totalDays > 59 / 60 / 24) {
        const roundHours = age.round({ largestUnit: 'hour', smallestUnit: 'hour' }).hours;
        return `${roundHours} hour${roundHours === 1 ? '' : 's'}`;
    } else if (totalDays > 59 / 60 / 60 / 24) {
        const roundMinutes = age.round({ largestUnit: 'minute', smallestUnit: 'minute' }).minutes;
        return `${roundMinutes} minute${roundMinutes === 1 ? '' : 's'}`;
    } else {
        const roundSeconds = age.round({ largestUnit: 'second', smallestUnit: 'second' }).seconds;
        return `${roundSeconds} second${roundSeconds === 1 ? '' : 's'}`;
    }
}
