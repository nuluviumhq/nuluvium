# @nuluvium/mcp

MCP server that lets an AI agent trade stock tokens on Robinhood Chain without its trades tracing
back to it. The agent keeps a shielded USDG balance; each order is split into pieces of random size,
sent at random times, each bought from a fresh address through the Nuluvium relayer.

It runs **on the agent's own machine**: the secret, the notes and the order schedule never leave it.
Privacy is from other readers of the chain, not from Robinhood.

**Testnet only for now** (Robinhood Chain testnet, test tokens). Deposits are capped at 1,000 USDG
each until the audit.

## Setup

Node.js 22.18 or newer. First, once:

```sh
npx -y @nuluvium/mcp --prepare
```

This installs the package and downloads the circuit files (about 23 MB) into
`~/.nuluvium/artifacts`, then exits. It needs no secret. Without it the first start takes over a
minute, longer than many MCP clients wait. The Privacy Pools SDK checks every circuit file against
its pinned SHA-256 hash before proving.

Then add this to your MCP client config (Claude Code `.mcp.json`, Claude Desktop
`claude_desktop_config.json`, Cursor, Codex…):

```json
{
  "mcpServers": {
    "nuluvium": {
      "command": "npx",
      "args": ["-y", "@nuluvium/mcp"],
      "env": {
        "NULUVIUM_MNEMONIC": "${NULUVIUM_MNEMONIC}",
        "NULUVIUM_NETWORK": "robinhood-testnet"
      }
    }
  }
}
```

Set `NULUVIUM_MNEMONIC` in the agent's environment: twelve words that only this machine knows. Use a
new testnet mnemonic, never a real wallet's.

| Variable | |
|---|---|
| `NULUVIUM_MNEMONIC` | required. The agent's secret. Removed from the process environment after reading; never returned |
| `NULUVIUM_NETWORK` | default `robinhood-testnet` |
| `NULUVIUM_RPC_URL` | optional own RPC (for networks that block `*.robinhood.com`) |
| `NULUVIUM_HOME` | default `~/.nuluvium` (order schedule and circuit files; local only) |
| `NULUVIUM_ARTIFACTS` | optional folder with the circuit files |

## Tools

| Tool | Does |
|---|---|
| `get_balance` | Shielded USDG per note with its status (approved, waiting, rejected), the deposit wallet, tradable tokens |
| `deposit` | Moves USDG from the deposit wallet into the shielded balance (1 to 1,000 USDG; common sizes such as 100 blend in better) |
| `route_order` | Buys a stock token in pieces over a time window; returns at once, pieces go out in the background |
| `cancel_order` | Cancels pieces not sent yet |
| `get_orders` | Orders and the status of every piece |
| `get_fills` | Executed pieces: USDG spent, fee, tokens received, fresh address, transaction |

The deposit wallet is the mnemonic's first address (`m/44'/60'/0'/0/0`): send it USDG and a little
ETH for gas, then call `deposit`. A deposit is public; what the note pays for later is not linked to
it. Orders run while the server runs.

Docs: [github.com/nuluviumhq/nuluvium](https://github.com/nuluviumhq/nuluvium/blob/main/docs/mcp.md).
License: Apache-2.0.
