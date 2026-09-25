# Deploy

Wayfinder is a hosted solution: the gateway, checkpoints, cache, and
dashboards run for you at
`https://wayfinder-backend.buildwithmanish.com`. Sign in on this site,
create a `wf_…` key in the [dashboard](/dashboard), and call the
[API](API.md) or [MCP](MCP.md) endpoint. No install, no weights, no ops.

Running your own copy (source, local setup, Docker/Kubernetes runbook,
operator env reference) lives on
[GitHub](https://github.com/manish-9245/Wayfinder).

## Getting the most out of hosted

- [ ] Batch background workloads via `/predict/batch` (≤128 states/call).
- [ ] Watch `/metrics` (hit rate < 20% on repeated traffic = key bug on your side).
- [ ] Tune per-call thresholds (`auto_act_above`, `escalate_below`) after one
      week of escalation labels — start at 0.85/0.60.
- [ ] Pin `model` only when you know better than the router; omit it otherwise.
- [ ] Quote `X-Request-ID` response headers in support requests.
