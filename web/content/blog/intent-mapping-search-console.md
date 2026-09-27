---
title: "Sort 10,000 queries by what the searcher actually wants"
date: 2026-09-25
tag: SEO
blurb: Export Search Console, classify every query into six intents in batches, and let low-confidence rows queue for a human instead of guessing.
minutes: 7
---

Open any Search Console export and you will find the same swamp: thousands of queries, most seen once, each one a tiny mystery about what the searcher wanted. Teams either ignore the long tail or hand-write regexes that rot within a quarter ("best" means commercial until it means a support article about best practices).

Intent mapping is a choice question with a fixed taxonomy. Six labels, one pick each, a confidence attached. That is exactly what the `seo_intent` policy does — and at batch scale you can run the whole export in minutes.

## The architecture

```mermaid
flowchart LR
    A["Search Console export<br/>queries + clicks"] --> B["POST /predict/batch<br/>policy: seo_intent"]
    B --> C["intent + confidence<br/>per query"]
    C --> D["confident → auto-tag<br/>unsure → review queue"]
    D --> E["Content map:<br/>build, merge, or ignore"]
```

The taxonomy stays small on purpose: informational, commercial, transactional, navigational, support, other. Every extra label is a new way for two editors to disagree. If a query genuinely fits nothing, "other" plus a low confidence is an honest answer.

## Build it

```bash
curl $WF_URL/predict/batch \
  -H "authorization: Bearer $WF_KEY" -H 'content-type: application/json' -d '{
  "states": [{"text": "best crm for 20 person agency pricing"}],
  "policy": "seo_intent"
}'
```

```python
rows = run("intent", queries)  # examples/seo_bulk.py
commercial = [r for r in rows if r["intent"] == "commercial"]
```

Then the content decisions fall out: transactional queries with no landing page are build orders, informational clusters pointing at one thin page are merge candidates, and navigational queries for competitors are someone else's problem.

## Gating by confidence

A thousand queries into two dozen categories costs single-digit cents — but the win is not the auto-tagging, it is the triage. Review the few hundred rows the model flags as uncertain instead of all ten thousand. The full probability distribution tells the reviewer *why* it hesitated, which is usually more useful than the pick itself.

## Pitfalls

- **Freeze the taxonomy for a quarter.** If you rename labels monthly, your trend lines are fiction.
- **Locale matters.** "Football boots" and "soccer cleats" carry different intents in different markets — include locale in the state.
- **Re-run, don't accumulate.** Intent drifts as SERPs change. Schedule the export monthly and diff the tags.
