"""Fast eval-metric unit tests (no weights): scoring + verdict logic.

Weight-backed accuracy lives in evals/run_evals.py (run locally / nightly,
gated by WAYFINDER_E2E=1 below). These tests keep the metric code honest in CI.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from evals.run_evals import score_one


def test_score_choice():
    ok, _ = score_one("choice", {"choice": "billing"}, "billing")
    assert ok
    ok, _ = score_one("choice", {"choice": "technical"}, "billing")
    assert not ok


def test_score_noul_threshold():
    assert score_one("noul", {"noul": 0.9}, True)[0]
    assert score_one("noul", {"noul": 0.1}, False)[0]
    assert not score_one("noul", {"noul": 0.9}, False)[0]


def test_score_levels():
    ok, info = score_one("score", {"score": 2.0, "probabilities": {"0": 0, "1": 0, "2": 1}}, 2)
    assert ok and info["ae"] == 0
    ok, info = score_one("score", {"score": 1.0, "probabilities": {"0": 0, "1": 1, "2": 0}}, 2)
    assert not ok and info["within1"]


def test_datasets_parse():
    import json

    ds = Path(__file__).resolve().parent.parent / "evals" / "datasets"
    files = sorted(ds.glob("*.jsonl"))
    covered = {f.name.split("_public")[0].removesuffix(".jsonl") for f in files}
    # every seed policy file must exist (extra *_public files are eval-only additions)
    import yaml
    policies = yaml.safe_load(open(ds.parent.parent / "wayfinder" / "policies.yaml"))["policies"]
    assert set(policies) <= {f.stem for f in files} | covered, \
        f"missing policies: {set(policies) - covered}"
    total = 0
    for f in files:
        rows = [json.loads(line) for line in open(f) if line.strip()]
        assert rows, f"{f.name} is empty"
        for r in rows:
            assert set(r) >= {"id", "state", "expected"}, r.get("id")
            assert isinstance(r["state"], dict), r["id"]
        total += len(rows)
    assert total >= 400, f"only {total} eval rows, need >= 400"
