# Web Specification Maintenance

This repository collects ideas for how we might track how well we're maintaining specifications, and
identify specs that need more maintenance.

## Triage

All new issues (and PRs) need to get a priority assigned within a reasonable amount of time. To
determine that amount of time, I looked at the distribution of the times it took issues to get their
first comment.

| | Issues that are<br>still open | Issues that have<br>been closed | Overall
---: | --- | --- | ---
10th percentile | 26 minutes | 4 minutes | 9 minutes
25th percentile | 45 minutes | 15 minutes | 15 minutes
median | 2 days | 14 hours | 14 hours
mean | 1.8 months | 3.6 weeks | 3.6 weeks
75th percentile | 3.4 weeks | 2.3 weeks | 2.3 weeks
90th percentile | 3.4 months | 1 month | 1 month

I propose we set an SLO of 1 week to triage issues. If all issues took as long to triage as they do
to comment on, this would leave 22% of the 16728 open issues currently out of SLO. 20% of the 103331
issues we've ever had have violated this SLO.
