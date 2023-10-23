# Web Specification Maintenance

This repository collects ideas for how we might track how well we're maintaining specifications, and
identify specs that need more maintenance.

## Triage

All new issues (and PRs) need to get a priority assigned within a reasonable amount of time. To
determine that amount of time, I looked at the distribution of the times it took issues to get their
first comment or review from someone other than the issue's author.

| | Issues that are<br>still open | Issues that have<br>been closed | Overall
---: | --- | --- | ---
10th percentile | 21 minutes | 7 minutes | 8 minutes
25th percentile | 2 hours    | 43 minutes | 50 minutes
median          | 16 hours   | 8 hours    | 9 hours
mean            | 2.1 months | 3.3 weeks  | 1 month
75th percentile | 1.3 weeks  | 3 days    | 3 days
90th percentile | 4.3 months | 3.3 weeks | 1 month

I propose we set an SLO of 1 week to triage issues. If all issues took as long to triage as they do
to comment on, this would leave 26% of the 16731 open issues currently out of SLO. 20% of the 94591
issues we've ever had have violated this SLO.

## Priorities

I propose we define 3 priority levels, with labels `Priority: Urgent`, `Priority: Important`, and
`Priority: Eventually`. `Priority: Eventually` issues won't have an SLO. For the others, we can look
at the latency distribution for closing issues. Still-open issues tend to be much older than closed
issues, and I assume they'd mostly be labeled with `Priority: Eventually`.

| | Time to close
---: | ---
10th percentile | 1 hour
25th percentile | 17 hours
median          | 1.1 weeks
mean            | 3.7 months
75th percentile | 2.3 months
90th percentile | 11.1 months

With half of all closed issues being closed in about a week, we can probably set a `Priority:
Urgent` SLO of 1 week more than the triage SLO, so 2 weeks.

If we set a `Priority: Important` of 3 months, we'll catch over half of the remaining issues, so
that's what I suggest.
