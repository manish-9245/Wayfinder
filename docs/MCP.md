# MCP server

Any MCP client (Claude Desktop, Cursor, OpenClaw, …) can call gate policies as
tools with no glue code. The MCP server is a separate stdio process with its own
lazy Router; it reads the same `wayfinder/policies.yaml` format.

## Install

```bash
.venv/bin/python -m pip install -e ".[mcp]"
```

## Run

```bash
wayfinder-mcp   # or: .venv/bin/python -m gate.mcp_server
```

`WAYFINDER_PRELOAD` defaults to lazy so the MCP handshake is instant; the first
tool call pays the checkpoint load. Set `WAYFINDER_PRELOAD=1` + `LAYA_MODELS` to
preload instead. `LAYA_DEVICE`, `LAYA_THREADS`, `WAYFINDER_POLICIES` work as in
`wayfinder/config.py`.

## Client config (stdio)

```json
{
  "mcpServers": {
    "wayfinder": {
      "command": "wayfinder-mcp",
      "env": { "LAYA_DEVICE": "cpu" }
    }
  }
}
```

## Tools

| Tool | Args | Returns |
|---|---|---|
| `wayfinder_decide` | `policy`, `state`, `model?` | answers + `verdict` |
| `wayfinder_predict` | `state`, `questions`, `model?` | raw laya result |
| `wayfinder_route` | `state`, `questions` | checkpoint + reason, no forward pass |
| `wayfinder_policies` | none | every policy with questions + thresholds |
| `wayfinder_status` | none | health, never loads weights |

All tools return structured JSON strings and are for structured decisions
only (`choice` / `score` / `noul`). Not open Q&A or text generation.
