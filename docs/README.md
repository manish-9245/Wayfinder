# Docs

Start with the [README](../README.md), then go deeper:

| Doc | What it covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Request path diagram, lifecycle, failure modes, scaling notes |
| [API.md](API.md) | Every endpoint, fields, errors, Python/TS snippets |
| [POLICIES.md](POLICIES.md) | Question primitives, built-ins, per-call overrides, calibration |
| [MCP.md](MCP.md) | Stdio server install, client config, the five tools |
| [DEPLOY.md](DEPLOY.md) | Local, Docker Compose, Kubernetes shape, perf checklist |

The interactive console (Next.js, `web/`) mirrors these docs under its Docs tab,
served from these same files. Edit here once and both stay in sync.

Site guides live separately in `web/content/blog/` (one Markdown file per
post, rendered at `/blog` with an index, mermaid diagrams, and prev/next
links). Product use-case posts pair with the policies in `wayfinder/policies.yaml`
and the runnable scripts in `examples/`.

Markdown supported by the site renderer (docs + blog): `**bold**`,
`*italic*` / `_italic_`, `==highlight==`, `++underline++`, `~~strike~~`,
tables, fenced code (adjacent bash/python fences render as tabs), and
` ```mermaid` architecture diagrams on blog posts.
