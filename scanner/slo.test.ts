import { Temporal } from '@js-temporal/polyfill';
import assert from 'node:assert';
import { countSloTime } from './slo.js';

describe("countSloTime", function () {
  it("counts from issue creation", function () {
    const now = Temporal.Instant.from('2023-01-10T12:00Z');
    assert.strictEqual(countSloTime({
      createdAt: Temporal.Instant.from('2023-01-01T00:00Z'),
      author: { login: "joe" },
      timelineItems: {
        totalCount: 3,
        pageInfo: { endCursor: null, hasNextPage: false },
        nodes: [
        ]
      },
    }, now).toJSON(), "P9DT12H");
  });
});
