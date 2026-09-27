# Policies

Each policy = description + thresholds + a `questions` mapping in the
`choice` | `score` | `noul` schema. The hosted gateway ships eleven reviewed
bundles; custom policy files are a self-hosting feature — see
[GitHub](https://github.com/manish-9245/Wayfinder).

```yaml
policies:
  my_flow:
    description: "What this gate protects."
    auto_act_above: 0.85   # confidence/signal >= this -> act (or block for safety)
    escalate_below: 0.60   # below this -> escalate (human)
    questions:
      dept:
        type: choice
        instructions: "Which team owns this?"
        criteria: {billing: "invoices, refunds", tech: "bugs, outages"}
      risk:
        type: noul
        instructions: "Is this risky or irreversible?"
```

## Primitives

| Type | Returns | Use |
|---|---|---|
| `choice` | label + per-option probs + confidence | routing, intent, topic |
| `score` | expected level + distribution + confidence | urgency, severity |
| `noul` | P(true) in [0,1] | jailbreak? toxic? churn? refund? |

Rules: `choice`/`score` need non-empty `criteria`; `noul` needs none (it
always scores `[false, true]`). Unknown types fail with the policy and
question named. Never silently.

## Built-ins

- `llm_firewall` → `allow/review/block` on jailbreak, injection, leak risk.
- `support_inbound` → `act/review/escalate` with department/urgency/churn/refund.
- `model_router` → `small/frontier/human` per request.
- `content_safety` → `allow/review/block` on toxic/threat/severity.
- `lead_scoring` → `act(hot)/review(warm)/escalate(cold)` on is_sales_enquiry/need/timeline/authority/budget. Weights live in your code; low confidence means warm, never cold.
- `seo_internal_link` → per source+candidate pair: relevance score + has_reason + anchor_ready. Batch pairs via `/predict/batch`; never invent URLs.
- `seo_intent` → `choice` intent for queries/pages (informational/commercial/transactional/navigational/support/other).
- `seo_audit` → `choice` keep/refresh/merge/remove + freshness score.
- `seo_prospect` → relevance score + message_fit for link outreach.
- `seo_gate` → pre-publish `noul` trio: intent_match/grounded/links_sane.
- `seo_answer` → answer_relevance score of one page against one buyer question.

## Per-call overrides (optional)

```bash
export WF_URL=https://wayfinder-backend.buildwithmanish.com
export WF_KEY=wf_…   # dashboard → API keys
# options is fully optional: omit it, pass null/{}, or override one threshold.
curl $WF_URL/v1/decide/support_inbound \
  -H "authorization: Bearer $WF_KEY" -H 'content-type: application/json' -d '{
  "state": {...},
  "model": "multilingual"
}'
# with optional confidence override:
# "options": {"auto_act_above": 0.9, "escalate_below": 0.5}
```

`model` pins a checkpoint (`english|multilingual|typed-decisions`); omit to
auto-route by script/language (<1ms). `lang` skips detection when you
already know the ISO code. Overrides never mutate global state.

## Calibration honesty

The model's probabilities are trained with proper scoring rules and
temperature-fit (base ECE 0.466 down to 0.081 on English), but multilingual
ships uncalibrated. Fit temperatures on your own held-out data before
trusting `auto_act_above` for irreversible actions. Start at 0.85/0.60,
measure escalation precision for a week, then tune per policy. Gate on
`confidence`, not on `action.act_probability` (which reads ~1.0 for almost
every input upstream).
