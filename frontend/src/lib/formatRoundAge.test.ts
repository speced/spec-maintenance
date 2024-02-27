import { Temporal } from '@js-temporal/polyfill';
import assert from 'node:assert';
import { formatRoundAge } from './formatRoundAge.js';

function d(s: string | Temporal.DurationLike) {
    return Temporal.Duration.from(s);
}
describe("formatRoundAge", function () {
    it("switches between units reasonably", function () {
        assert.strictEqual(formatRoundAge(d({ days: 396 })), "1.1 years");
        assert.strictEqual(formatRoundAge(d({ days: 366 })), "1 year");
        assert.strictEqual(formatRoundAge(d({ days: 365 })), "12 months");
        assert.strictEqual(formatRoundAge(d({ days: 33 })), "1.1 months");
        assert.strictEqual(formatRoundAge(d({ days: 31 })), "1 month");
        assert.strictEqual(formatRoundAge(d({ days: 30 })), "4.3 weeks");
        assert.strictEqual(formatRoundAge(d({ days: 8 })), "1.1 weeks");
        assert.strictEqual(formatRoundAge(d({ days: 7 })), "1 week");
        assert.strictEqual(formatRoundAge(d({ days: 6, hours: 2 })), "0.9 weeks");
        // Days and smaller units don't use fractions.
        assert.strictEqual(formatRoundAge(d({ days: 6 })), "6 days");
        assert.strictEqual(formatRoundAge(d({ days: 5, hours: 2 })), "5 days");
        assert.strictEqual(formatRoundAge(d({ hours: 28 })), "1 day");
        assert.strictEqual(formatRoundAge(d({ hours: 24 })), "1 day");
        assert.strictEqual(formatRoundAge(d({ hours: 23 })), "23 hours");
        assert.strictEqual(formatRoundAge(d({ minutes: 67 })), "1 hour");
        assert.strictEqual(formatRoundAge(d({ minutes: 60 })), "1 hour");
        assert.strictEqual(formatRoundAge(d({ minutes: 59 })), "59 minutes");
        assert.strictEqual(formatRoundAge(d({ seconds: 67 })), "1 minute");
        assert.strictEqual(formatRoundAge(d({ seconds: 60 })), "1 minute");
        assert.strictEqual(formatRoundAge(d({ seconds: 59 })), "59 seconds");
        assert.strictEqual(formatRoundAge(d({ milliseconds: 900 })), "1 second");
    });
    it("handles large second-based durations", function () {
        assert.strictEqual(formatRoundAge(d({ seconds: 1125513 })), "1.9 weeks");
    });
});
