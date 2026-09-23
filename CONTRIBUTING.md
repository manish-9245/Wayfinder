# Contributing to wayfinder

Thanks for helping. This project is intentionally small: a stateless gateway,
policies, a console, and docs around the `laya` pip package. All model code
lives upstream. Please keep it that way.

## Setup

```bash
python3 -m venv .venv && .venv/bin/python -m pip install -e ".[mcp]"
.venv/bin/python -m pytest tests/ -q
cd web && npm install && npm run build
```

Copy `.env.example` to `.env` if you need local secrets (never commit `.env`).
Set `HF_TOKEN` to raise Hugging Face rate limits on first checkpoint download.

## What belongs here

- Gateway behavior: validation, policies, verdicts, cache, auth, metrics
- Console UX and docs that explain the gateway
- Tests for any new behavior (no-weights tests in `tests/`, stubbed Router)

## What belongs upstream

Checkpoint behavior, new primitives, encoder changes, calibration science.
File those against `laya` itself and depend on the release here.

## Pull request checklist

- [ ] `pytest tests/ -q` green (12 fast tests, no weights, no network)
- [ ] `npm run build` clean in `web/`
- [ ] No em-dashes anywhere user-visible (project style rule)
- [ ] New endpoints documented in `docs/API.md` and the console Docs tab source
- [ ] New policies include thresholds plus a console example in `web/lib/examples.ts`
- [ ] Contrast pairs rechecked if you touched colors (aim 4.5:1 or better)
- [ ] `prefers-reduced-motion` still honored if you touched animation

## Release flow

1. Bump `version` in `pyproject.toml` and `web/package.json` together.
2. Note weight-affecting changes (laya pins) versus gateway-only changes.
3. Tag `vX.Y.Z`. Docker images build from the tag.
