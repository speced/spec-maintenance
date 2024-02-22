import { Temporal } from '@js-temporal/polyfill';
import assert from 'node:assert';
import { countSloTime } from './slo.js';

function i(s: string) {
  return Temporal.Instant.from(s);
}
describe("countSloTime", function () {
  it("counts time the label is applied", function () {
    const now = i('2023-01-10T12:00Z');
    assert.strictEqual(countSloTime({
      createdAt: i('2023-01-01T00:00Z'),
      author: { login: "joe" },
      timelineItems: {
        totalCount: 3,
        pageInfo: { endCursor: null, hasNextPage: false },
        nodes: [
          { // Unlike draft PRs, which are created in the draft state, current labels always have a
            // LabeledEvent adding them.
            __typename: "LabeledEvent",
            createdAt: i("2023-01-02T00:00Z"),
            label: { name: "Priority: Soon" }
          }, {
            __typename: "UnlabeledEvent",
            createdAt: i("2023-01-03T00:00Z"),
            label: { name: "Priority: Soon" }
          }, {
            __typename: "LabeledEvent",
            createdAt: i("2023-01-04T00:00Z"),
            label: { name: "Priority: Soon" }
          },
        ]
      },
    }, now, "soon").toJSON(), "P7DT12H");
  });

  it("counts 'urgent' time toward 'soon' SLO", function () {
    const now = i('2023-01-10T12:00Z');
    assert.strictEqual(countSloTime({
      createdAt: i('2023-01-01T00:00Z'),
      author: { login: "joe" },
      timelineItems: {
        totalCount: 3,
        pageInfo: { endCursor: null, hasNextPage: false },
        nodes: [
          { __typename: "LabeledEvent",
            createdAt: i("2023-01-02T00:00Z"),
            label: { name: "Priority: Urgent" }
          }, {
            __typename: "UnlabeledEvent",
            createdAt: i("2023-01-03T00:00Z"),
            label: { name: "Priority: Urgent" }
          }, {
            __typename: "LabeledEvent",
            createdAt: i("2023-01-04T00:00Z"),
            label: { name: "Priority: Soon" }
          },
        ]
      },
    }, now, "soon").toJSON(), "P7DT12H");
  });

  it("multiply-labeled time is counted once", function () {
    const now = i('2023-01-10T12:00Z');
    assert.strictEqual(countSloTime({
      createdAt: i('2023-01-01T00:00Z'),
      author: { login: "joe" },
      timelineItems: {
        totalCount: 3,
        pageInfo: { endCursor: null, hasNextPage: false },
        nodes: [
          { __typename: "LabeledEvent",
            createdAt: i("2023-01-02T00:00Z"),
            label: { name: "Priority: Urgent" }
          }, {
            __typename: "LabeledEvent",
            createdAt: i("2023-01-03T00:00Z"),
            label: { name: "Priority: Soon" }
          }, {
            __typename: "UnlabeledEvent",
            createdAt: i("2023-01-04T00:00Z"),
            label: { name: "Priority: Urgent" }
          },
        ]
      },
    }, now, "soon").toJSON(), "P8DT12H");
  });

  it("does not count 'soon' time toward 'urgent' SLO", function () {
    const now = i('2023-01-10T12:00Z');
    assert.strictEqual(countSloTime({
      createdAt: i('2023-01-01T00:00Z'),
      author: { login: "joe" },
      timelineItems: {
        totalCount: 3,
        pageInfo: { endCursor: null, hasNextPage: false },
        nodes: [
          { __typename: "LabeledEvent",
            createdAt: i("2023-01-02T00:00Z"),
            label: { name: "Priority: Soon" }
          }, {
            __typename: "UnlabeledEvent",
            createdAt: i("2023-01-03T00:00Z"),
            label: { name: "Priority: Soon" }
          }, {
            __typename: "LabeledEvent",
            createdAt: i("2023-01-04T00:00Z"),
            label: { name: "Priority: Urgent" }
          },
        ]
      },
    }, now, "urgent").toJSON(), "P6DT12H");
  });

  it("ignores closed time", function () {
    const now = i('2023-01-06T00:00Z');
    assert.strictEqual(countSloTime({
      createdAt: i('2023-01-01T00:00Z'),
      author: { login: "joe" },
      timelineItems: {
        totalCount: 3,
        pageInfo: { endCursor: null, hasNextPage: false },
        nodes: [{
          __typename: "LabeledEvent",
          createdAt: i("2023-01-01T00:00Z"),
          label: { name: "Priority: Soon" }
        }, {
          __typename: "ClosedEvent",
          createdAt: i("2023-01-02T00:00Z")
        }, {
          __typename: "ReopenedEvent",
          createdAt: i("2023-01-05T00:00Z")
        },
        ]
      },
    }, now, "soon").toJSON(), "P2D");
  });

  it("ignores needs-feedback time", function () {
    const now = i('2023-01-06T00:00Z');
    assert.strictEqual(countSloTime({
      createdAt: i('2023-01-01T00:00Z'),
      author: { login: "joe" },
      timelineItems: {
        totalCount: 3,
        pageInfo: { endCursor: null, hasNextPage: false },
        nodes: [{
          __typename: "LabeledEvent",
          createdAt: i("2023-01-01T00:00Z"),
          label: { name: "Priority: Soon" }
        }, {
          __typename: "LabeledEvent",
          createdAt: i("2023-01-02T00:00Z"),
          label: { name: "Needs Reporter Feedback" }
        }, {
          __typename: "UnlabeledEvent",
          createdAt: i("2023-01-05T00:00Z"),
          label: { name: "Needs Reporter Feedback" }
        },
        ]
      },
    }, now, "soon").toJSON(), "P2D");
  });

  describe("stops needing feedback when reporter comments", function () {
    for (const commentType of
      ["IssueComment", "PullRequestReview", "PullRequestReviewThread"] as const) {
      it(`in a ${commentType}`, function () {
        const now = i('2023-01-06T00:00Z');
        assert.strictEqual(countSloTime({
          createdAt: i('2023-01-01T00:00Z'),
          author: { login: "joe" },
          timelineItems: {
            totalCount: 3,
            pageInfo: { endCursor: null, hasNextPage: false },
            nodes: [{
              __typename: "LabeledEvent",
              createdAt: i("2023-01-01T00:00Z"),
              label: { name: "Priority: Soon" }
            }, {
              __typename: "LabeledEvent",
              createdAt: i("2023-01-02T00:00Z"),
              label: { name: "Needs Reporter Feedback" }
            }, {
              __typename: commentType,
              createdAt: i("2023-01-03T00:00Z"),
              author: { login: "joe" },
              // Make the type checker happy:
              comments: { nodes: [{ createdAt: i("2023-01-03T00:00Z"), author: { login: 'joe' } }] }
            },
            ]
          },
        }, now, "soon").toJSON(), "P4D");
      });
    }
  });

  it("still needs feedback if non-reporter comments", function () {
    const now = i('2023-01-06T00:00Z');
    assert.strictEqual(countSloTime({
      createdAt: i('2023-01-01T00:00Z'),
      author: { login: "joe" },
      timelineItems: {
        totalCount: 3,
        pageInfo: { endCursor: null, hasNextPage: false },
        nodes: [{
          __typename: "LabeledEvent",
          createdAt: i("2023-01-01T00:00Z"),
          label: { name: "Priority: Soon" }
        }, {
          __typename: "LabeledEvent",
          createdAt: i("2023-01-02T00:00Z"),
          label: { name: "Needs Reporter Feedback" }
        }, {
          __typename: "IssueComment",
          createdAt: i("2023-01-03T00:00Z"),
          author: { login: "not joe" }
        }, {
          __typename: "UnlabeledEvent",
          createdAt: i("2023-01-05T00:00Z"),
          label: { name: "Needs Reporter Feedback" }
        },
        ]
      },
    }, now, "soon").toJSON(), "P2D");
  });

  it("ignores draft time", function () {
    const now = i('2023-01-06T00:00Z');
    assert.strictEqual(countSloTime({
      createdAt: i('2023-01-01T00:00Z'),
      author: { login: "joe" },
      timelineItems: {
        totalCount: 3,
        pageInfo: { endCursor: null, hasNextPage: false },
        nodes: [{
          __typename: "LabeledEvent",
          createdAt: i("2023-01-01T00:00Z"),
          label: { name: "Priority: Soon" }
        }, {
          __typename: "ConvertToDraftEvent",
          createdAt: i("2023-01-02T00:00Z"),
        }, {
          __typename: "ReadyForReviewEvent",
          createdAt: i("2023-01-05T00:00Z"),
        }
        ]
      },
    }, now, "soon").toJSON(), "P2D");
  });

  it("handles PRs created as drafts", function () {
    const now = i('2023-01-06T00:00Z');
    assert.strictEqual(countSloTime({
      createdAt: i('2023-01-01T00:00Z'),
      author: { login: "joe" },
      timelineItems: {
        totalCount: 3,
        pageInfo: { endCursor: null, hasNextPage: false },
        nodes: [{
          __typename: "LabeledEvent",
          createdAt: i("2023-01-01T00:00Z"),
          label: { name: "Priority: Soon" }
        }, {
          // Seeing the ReadyForReviewEvent first means the PR was created as a draft, so all time
          // before it should be ignored.
          __typename: "ReadyForReviewEvent",
          createdAt: i("2023-01-05T00:00Z"),
        }
        ]
      },
    }, now, "soon").toJSON(), "P1D");
  });

  it("only counts time where none of the exemptions are active", function () {
    const now = i('2023-01-08T00:00Z');
    assert.strictEqual(countSloTime({
      createdAt: i('2023-01-01T00:00Z'),
      author: { login: "joe" },
      timelineItems: {
        totalCount: 3,
        pageInfo: { endCursor: null, hasNextPage: false },
        nodes: [{
          __typename: "LabeledEvent",
          createdAt: i("2023-01-01T00:00Z"),
          label: { name: "Priority: Soon" }
        }, { // Draft
          __typename: "ClosedEvent",
          createdAt: i("2023-01-02T00:00Z")
        }, { // Draft & Closed
          __typename: "LabeledEvent",
          createdAt: i("2023-01-03T00:00Z"),
          label: { name: "Needs Reporter Feedback" }
        }, { // Draft & Closed & Feedback
          __typename: "ReadyForReviewEvent",
          createdAt: i("2023-01-04T00:00Z"),
        }, { // Closed & Feedback
          __typename: "UnlabeledEvent",
          createdAt: i("2023-01-05T00:00Z"),
          label: { name: "Needs Reporter Feedback" }
        }, { // Closed
          __typename: "ReopenedEvent",
          createdAt: i("2023-01-06T00:00Z")
        }, { // Counting SLO time.
          __typename: "LabeledEvent",
          createdAt: i("2023-01-07T00:00Z"),
          label: { name: "Needs Reporter Feedback" }
        },
        ]
      },
    }, now, "soon").toJSON(), "P1D");
  });

});
