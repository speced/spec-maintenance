# Spec maintenance tracking brainstorm

This is a working document for https://www.w3.org/events/meetings/6047d4b8-20ae-4909-8868-696b14a213ff/.

This ties into [w3c/AB-memberonly#53](https://github.com/w3c/AB-memberonly/issues/53).


## Labeling needs

Starting from [Recommended Github labels](https://w3c.github.io/issue-metadata.html).

All new labels should group by prefix.

bug: The specification is broken or misleading and needs to change.

enhancement: The specification works as-is but could be improved.

P0/urgent: fix asap

P1/important: fix soon

backlog: no SLO

blocks-implementation: An additional implementation can't be finished before this is resolved.

needs-feedback: Can't proceed until the issue reporter answers some question. This should pause SLOs. See the CSSWG for more examples: https://github.com/w3c/csswg-drafts/labels?page=8&sort=name-asc, first page and the last few

Blocking graph should be obvious from label names. e.g. "needs-feedback" isn't clear; should be "blocked-on-op-feedback" or similar.

Implementer issues might have some extra time sensitivity. They might ship-anyway. Or if a team is focused, we have an opportunity for rapid progress.

### Training

Needs to be continuous

### SLOs

Probably can't finalize these today.

Time limit to triage issues/PRs:

Time limit for P0s:

Time limit for P1s:

Time limit for blocks-implementation:

### Dealing with absent editors

See https://w3c.github.io/w3c.json.html.

Maybe put this in spec metadata instead.

Add links to the responsible teams within each implementation. Google can identify teams with a number/string. What do other orgs need?

* Tess: for Apple anyway, the metadata would simply be “ask @hober to find a victim”

Add a marker here if the editors have rotated off and will need extra time to respond to new issues?

What about WHATWG?

### Define the triage process

Who's responsible?

In the WHATWG, it's the editor.

Editor is a good default. If the editor isn't responsive, and it's in a WG, go to the chair. If the chair isn't responsive or needs help, go to the implementer teams.

## Tooling needs

Repository in [https://github.com/speced](https://github.com/speced)?

Needs to scan all issues periodically and count ones that are out of SLO.
