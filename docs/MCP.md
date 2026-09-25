# MCP server

Any MCP client (Claude Desktop, Cursor, OpenClaw, …) can call gate policies
as tools over the hosted endpoint — no local install, no weights download.
The tools run on the hosted gateway against the same policies and
thresholds as the REST API, and every call needs your `wf_…` API key
([dashboard](/dashboard) → API keys).

Endpoint: `https://wayfinder-backend.buildwithmanish.com/mcp/`
(Streamable HTTP, stateless — safe behind any number of replicas).

## Client config (hosted)

Via [`mcp-remote`](https://github.com/geelen/mcp-remote) (stdio bridge —
most clients accept this shape verbatim):

```json
{
  "mcpServers": {
    "wayfinder": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://wayfinder-backend.buildwithmanish.com/mcp/",
        "--header", "Authorization: Bearer ${WAYFINDER_API_KEY}"
      ],
      "env": { "WAYFINDER_API_KEY": "wf_…" }
    }
  }
}
```

Clients with native remote support (Cursor, OpenClaw, …) can point at the
URL directly with the `Authorization: Bearer wf_…` header instead.

Without a key (or with a revoked one) the endpoint answers `401`, exactly
like the REST routes.

## Tools

| Tool | Args | Returns |
|---|---|---|
| `wayfinder_decide` | `policy`, `state`, `model?` | answers + `verdict` |
| `wayfinder_predict` | `state`, `questions`, `model?` | raw result |
| `wayfinder_route` | `state`, `questions` | checkpoint + reason, no forward pass |
| `wayfinder_policies` | none | every policy with questions + thresholds |
| `wayfinder_status` | none | health, never loads weights |

All tools return structured JSON strings and are for structured decisions
only (`choice` / `score` / `noul`). Not open Q&A or text generation.

Running your own MCP server (stdio, self-hosted weights) is documented on
[GitHub](https://github.com/manish-9245/Wayfinder).
