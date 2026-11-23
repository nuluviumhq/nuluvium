# Nuluvium

[![CI](https://github.com/nuluviumhq/nuluvium/actions/workflows/ci.yml/badge.svg)](https://github.com/nuluviumhq/nuluvium/actions/workflows/ci.yml)

The privacy layer for onchain stocks on Robinhood Chain.

Nuluvium routes stock token orders for people and AI agents through fresh addresses, paid from a
shielded USDG balance, so trades do not trace back to the wallet or the strategy behind them.

- Site and app (testnet): https://nuluvium.com
- Docs: https://nuluvium.com/docs
- Reviewing the code? Start with [docs/review.md](docs/review.md): how to build and test everything,
  what each claim rests on, who holds which key, and the known gaps.

> **Testnet only, not audited.** Everything here runs on Robinhood Chain testnet with test tokens.
> Do not use it with real funds.

## How it works

1. **Shield.** USDG is deposited into a shielded pool, a fork of
   [Privacy Pools](https://github.com/0xbow-io/privacy-pools-core) v1.3.0 whose contracts and
   circuits are used unchanged.
2. **Screen.** An approved-set provider checks every deposit (sanctions list, the stock token
   issuer's blocklist, a denylist, deposit caps) and posts the root of the approved set on chain.
3. **Prove.** For each piece of an order, the client makes a zero-knowledge proof that it owns an
   approved deposit, without saying which one.
4. **Route.** A relayer sends the proof to the Nuluvium Router, which releases the piece's USDG,
   swaps it on a public Uniswap v3 pool and sends the stock tokens to a fresh address.

Relayers bond NLV in a relayer registry (tNLV, a no-value test token, on testnet), and clients pick
them from it. Each piece pays the relayer's gas fee plus a 0.1% protocol fee in USDG: half to the
relayer that sent it, half to the treasury Safe. Traders never hold, pay or prove NLV; only relayer
operators earn, for the pieces they send. In v1, removing a relayer or slashing its bond is a
decision of the Safe signers, not automatic.

An order is split into pieces of random size at random times within a window. Readers of the chain
see the pieces, not that they belong together or to whom.

What Nuluvium does **not** do: it never matches orders, no contract of it holds stock tokens, and it
is private from other readers of the chain, **not from Robinhood**, which runs the chain and issues
the stock tokens. Keys, notes and order schedules stay on the user's device or the agent's machine;
no server stores the link between a user and their fresh addresses.

## Repository

| Folder | What it is |
|---|---|
| `contracts/` | Foundry project: `NuluviumRouter` (v1) and `NuluviumRouterV2`, `RelayerRegistry`, `TestNLV`, test USDG, deploy scripts and tests. Privacy Pools and forge-std are git submodules in `contracts/lib/`. |
| `asp/` | Approved-set provider, a Cloudflare Worker (cron screening, approved set, root posting). |
| `relayer/` | Relayer, a Cloudflare Worker with a Durable Object queue (`GET /quote`, `POST /piece`, `POST /sell`). |
| `stats/` | Public stats, a Cloudflare Worker: every 10 minutes it counts pool and Router events, the approved set and the relayer into totals (`GET /stats`), shown on `/stats`. |
| `faucet/` | Testnet faucet, a Cloudflare Worker at faucet.nuluvium.com: a little test ETH (only for a wallet with almost none) and 100 test USDG, once a day per wallet. |
| `sdk/` | `@nuluvium/sdk` in TypeScript: keys, notes rebuilt from the chain, proofs, planning, routing, ragequit and sells. |
| `mcp/` | MCP server for AI agents (stdio), runs on the agent's machine. |
| `ai-sdk/` | `@nuluvium/ai-sdk`: the MCP server's tools for the Vercel AI SDK (`generateText({ tools })`). |
| `web/` | Site, docs and web app: Next.js on Cloudflare Workers (OpenNext). |
| `testnet/` | Scripts that drove the testnet runs, with their records in `testnet/runs/`. |
| `docs/` | Technical notes: `router.md`, `sdk.md`, `mcp.md`, `testnet.md` (addresses, runs, findings). |

## Getting started

Requirements: Node.js 22.18 or newer (the SDK and MCP server run TypeScript directly), and
[Foundry](https://book.getfoundry.sh/) for the contracts.

```bash
git clone --recurse-submodules https://github.com/nuluviumhq/nuluvium.git
cd nuluvium
```

Everything at once (lint, every typecheck and test suite; CI runs the same):

```bash
npm ci && for p in contracts sdk mcp ai-sdk relayer asp stats faucet web; do (cd $p && npm ci); done
npm run check
```

Contracts:

```bash
cd contracts && npm install && forge test
FORK_TESTS=true forge test   # also the tests that fork Robinhood Chain (needs network access)
```

SDK and MCP server:

```bash
cd sdk && npm install && npm test
cd ../mcp && npm install && npm test
```

Circuit files for proofs (copied from the Privacy Pools submodule, once):

```bash
cd testnet && npm install && node setup-artifacts.mjs
```

Web app (http://localhost:3000 by default):

```bash
cd web && npm install && npm run dev
```

## Use it from an AI agent

The MCP server is on npm as [`@nuluvium/mcp`](https://www.npmjs.com/package/@nuluvium/mcp). Once:
`npx -y @nuluvium/mcp --prepare` (installs it and downloads the circuit files), then add
`"command": "npx", "args": ["-y", "@nuluvium/mcp"]` to your MCP client (setup in [mcp/README.md](mcp/README.md)).
With the Vercel AI SDK, [`@nuluvium/ai-sdk`](ai-sdk/README.md) starts the same server and returns its tools
for `generateText({ tools })` (guide: [nuluvium.com/docs/agents/ai-sdk](https://nuluvium.com/docs/agents/ai-sdk)).
Give the agent its own testnet mnemonic in its environment, never in a file:

```bash
export NULUVIUM_MNEMONIC="twelve words of a new testnet mnemonic"
export NULUVIUM_RPC_URL="https://your-testnet-rpc"   # optional, if your network blocks robinhood.com
```

From a clone of this repository, the root `.mcp.json` runs the server from source instead. The server offers `get_balance`, `deposit`,
`route_order`, `cancel_order`, `get_orders` and `get_fills`. Details: [docs/mcp.md](docs/mcp.md).

## Status

Testnet build complete: shielded pool, approved-set provider, Router, relayers, SDK, MCP server and
web app, each checked end to end on Robinhood Chain testnet ([docs/testnet.md](docs/testnet.md)).
The relayer model (tNLV, RelayerRegistry, Router v2 with the protocol fee) is deployed on testnet.
The owner roles (Router owner, registry owner, Entrypoint `OWNER_ROLE`) are held by a Safe 2-of-2
([docs/review.md](docs/review.md)). Before mainnet: an independent audit, real stock tokens priced
from Uniswap quotes, and a second relayer. Deposits are capped until the audit is published.

## Security

Not audited. Do not use with real funds.

Found a vulnerability? Please report it privately through
[Report a vulnerability](https://github.com/nuluviumhq/nuluvium/security/advisories/new)
(GitHub Security tab), not in a public issue.

## License

[Apache-2.0](LICENSE). The Privacy Pools contracts and circuits in `contracts/lib/privacy-pools-core`
are by 0xbow under Apache-2.0 and are used unchanged.
