# Web Specification Maintenance

This repository collects ideas for how we might track how well we're maintaining specifications, and
identify specs that need more maintenance.

## Triage

All new issues (and PRs) need to get a priority assigned within a reasonable amount of time. To
determine that amount of time, I looked at the distribution of the times it took issues to get their
first comment from someone other than the issue's author.

| | Issues that are<br>still open | Issues that have<br>been closed | Overall
---: | --- | --- | ---
10th percentile | 41 minutes | 48 minutes | 48 minutes
25th percentile | 2 hours    | 1 hour     | 1 hour
median          | 2 days     | 14 hours | 14 hours
mean            | 2.1 months | 1 month  | 1 month
75th percentile | 4 weeks    | 2.2 weeks | 2.2 weeks
90th percentile | 4.4 months | 1.3 months | 1.3 months

I propose we set an SLO of 1 week to triage issues. If all issues took as long to triage as they do
to comment on, this would leave 27% of the 16731 open issues currently out of SLO. 23% of the 103336
issues we've ever had have violated this SLO.

## Priorities

I propose we define 3 priority levels, with labels `Priority: Urgent`, `Priority: Important`, and
`Priority: Eventually`. `Priority: Eventually` issues won't have an SLO. For the others, we can look
at the latency distribution for closing issues. Still-open issues tend to be much older than closed
issues, and I assume they'd mostly be labeled with `Priority: Eventually`.

| | Time to close
---: | ---
10th percentile | 5 hours
25th percentile | 10 hours
median | 1.1 weeks
mean | 3.4 months
75th percentile | 3.8 months
90th percentile | 9.8 months
