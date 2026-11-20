# Nuluvium MCP server (session 1.7, 2026-11-16)

`mcp/`: a stdio MCP server an AI agent runs **on its own machine**. The secret, the notes and the
order schedule never leave that machine; pieces go out through the Nuluvium relayer.

## Tools
| Tool | Input | Does |
|---|---|---|
| `get_balance` | – | Shielded USDG per note with its ASP status (approved, waiting, rejected + reason), total and approved total, which notes are busy, the deposit wallet (address, USDG, ETH), tradable tokens |
| `deposit` | usdgAmount (1–1,000) | Approve + deposit from the deposit wallet into a new note; waits for both transactions |
| `route_order` | token, usdgAmount, pieces (1–20, default 5), windowMinutes (1–1440, default 10), maxSlippagePercent (default 1) | Plans random piece sizes and times, stores the order, sends pieces in the background; returns at once |
| `cancel_order` | orderId | Cancels pieces not sent yet |
| `get_orders` | onlyOpen | Orders and the status of every piece |
| `get_fills` | orderId (optional) | Executed pieces: USDG spent, fee, tokens received, fresh address, tx link |

`get_balance` was added to the planned four (user approved 2026-11-16): an agent cannot size an
order without it. `deposit` added 2026-11-17.

## Deposit wallet
The mnemonic's account 0 (`m/44'/60'/0'/0/0`, SDK `depositAccount`) pays for deposits; fresh
addresses use account 1, so the two never meet. The agent (or its owner) sends USDG and a little ETH
to it. A deposit is public and links this wallet to the amount, not to what the note pays for later.
Before sending, the tool checks the amount (1 to 1,000 USDG, the ASP's per-deposit cap) and that the
wallet holds the USDG and at least 0.00001 ETH; otherwise it answers with what to send and where.

## Rules
- One order is paid from one note (the smallest free, ASP-approved note that covers it); a note is
  busy while an order on it is open. A note still waiting for the ASP (about a minute after a
  deposit) is skipped; when only a waiting note covers the order, `route_order` says to retry
  shortly. The approved set is checked against its CID and the root on chain (one retry). v1 limit: an order cannot exceed the largest note.
- Before each piece the note is rebuilt from the chain (`recoverNotes`), so a restart, a crash or a
  piece sent elsewhere cannot desync it. Pieces of one note run one after another.
- Each piece is retried up to 3 times (20 s apart), then marked failed.
- Orders live in `~/.nuluvium/orders-<network>.json` (atomic writes). No secrets in it, but it links
  the fresh addresses of an order: local only.
- Only allowlisted tokens (testnet: MSTK mock at a fixed price; mainnet: real stock tokens with a
  Uniswap quote, not wired yet).
- stdout carries the protocol; the server sends all logs to stderr. It deletes the mnemonic from its
  environment after reading it and never returns it.

## Use it (testnet)
1. Once: `npx -y @nuluvium/mcp --prepare` (installs the package from npm and downloads the circuit
   files into `~/.nuluvium/artifacts`, then exits; no secret needed).
2. Add the server to the MCP client (`.mcp.json` for Claude Code, `claude_desktop_config.json` for
   Claude Desktop, or any other client's MCP settings):
   `"nuluvium": { "command": "npx", "args": ["-y", "@nuluvium/mcp"], "env": { "NULUVIUM_MNEMONIC": "${NULUVIUM_MNEMONIC}", "NULUVIUM_NETWORK": "robinhood-testnet" } }`.
3. Set the agent's secret in its environment (testnet mnemonic, not a real wallet), e.g. in
   PowerShell `$env:NULUVIUM_MNEMONIC = "<twelve words>"`, then start the client. If your network
   blocks `*.robinhood.com`, also set `NULUVIUM_RPC_URL` to your own testnet RPC, or use a VPN.
4. Approve the `nuluvium` server when the client asks, then try:
   "Check my Nuluvium balance, then buy 5 USDG of MSTK in 3 pieces over 4 minutes."

From a clone of this repository, the root `.mcp.json` runs the server from source instead
(`npm install` in `sdk/` and `mcp/`, and `node setup-artifacts.mjs` in `testnet/` once).

## npm package `@nuluvium/mcp` (published 2026-11-19, 0.1.0)
- `npm pack` in `mcp/` runs `prepack`: `tsconfig.build.json` compiles `src/` and the SDK sources it
  imports into `dist/` (Node does not run TypeScript from `node_modules`), and copies `LICENSE`.
  The package is about 27 kB, 23 files; `mcp/README.md` is its npm page.
- Circuit files are not in the package: on first run they are downloaded (about 23 MB, once) from
  the web app's `/artifacts/` into `~/.nuluvium/artifacts` (`src/artifacts.ts`, temp file + rename).
  The Privacy Pools SDK checks each against its pinned SHA-256 before proving, so the host is not
  trusted. Run from the source tree, `testnet/artifacts` is used when complete.
- `npx -y @nuluvium/mcp --prepare` installs the package and downloads the circuit files, then
  exits (no secret needed). A cold npx install took 77 s here, longer than MCP clients wait for a
  server to start; after `--prepare` the server connected in 10 to 22 s.
- The ASP's status can point at the previous set for up to about a minute after it posts a new root
  (Cloudflare KV spreads writes slowly). Since 2026-11-18 the SDK then takes the CID from the chain's
  `RootUpdated` event; if that read fails too, the server uses the last set that matched the chain,
  and before any match `get_balance` shows statuses as `unknown` and `route_order` asks to retry.
- Checked 2026-11-17 by running the packed file through npx (`--package=<file> nuluvium-mcp`) with an
  empty home: download, `deposit` 2 (note 11, approved in 20 s), `route_order` 2 USDG in 2 pieces
  ([1](https://explorer.testnet.chain.robinhood.com/tx/0x86113c1411aa2498696ce2caa58185fb8fc00a3eca953830940962a2ce2728c5),
  [2](https://explorer.testnet.chain.robinhood.com/tx/0x278af22267e83dc96117c2347cdcae95860b07fdc69df3f2e3364ce8dcbdd8fd)),
  both done. `npx <file path>` does not work (npx treats a path as a command); the registry name will.
- Published 2026-11-19 as 0.1.0 by the npm account `nuluvium` (brand email, 2FA). npm's staged
  publishing also left a `0.0.0-stage` placeholder version (2 files) next to it; `latest` is 0.1.0.
  Checked from the registry with an empty cache: `npx -y @nuluvium/mcp --prepare` in 60 s (install +
  circuit files); then the server over stdio via `npx -y @nuluvium/mcp`: connected in 52 s cold, 14 s
  warm, 6 tools, `get_balance` read the test wallet.
- 0.1.1 (2026-11-20): same code, adds `mcpName` for the official MCP Registry.
- Next version: bump `version` in `mcp/package.json` **and** both versions in `mcp/server.json`, then
  `npm publish --access public` from `mcp/` (the account owner runs it: npm asks for 2FA, and must be
  logged in as `nuluvium`: a logged-out publish fails with a misleading 404), then publish to the
  registry (below).

## Official MCP Registry (`com.nuluvium/mcp`, live since 2026-11-20)
- Entry: `mcp/server.json`; check with
  `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=com.nuluvium/mcp"`.
- Ownership of the `com.nuluvium/*` namespace is proven by an apex TXT record on nuluvium.com
  (`v=MCPv1; k=ed25519; p=...`). Keep it. The matching private key is kept outside the repo by
  the account owner; without it a new key and TXT record are needed.
- Publish a new version from `mcp/` after the npm publish (the registry checks the npm package's
  `mcpName`): `mcp-publisher validate`, then `mcp-publisher login dns --domain nuluvium.com
  --private-key <hex>`, then `mcp-publisher publish`. mcp-publisher 1.8.9 has no `--dry-run`:
  `validate` is the dry run. Published versions cannot be deleted, only marked deprecated
  (`mcp-publisher status`).

## Tests
- `cd mcp && npm test`: order status, store persistence, deposit rules, note approval and choice, circuit file download.
- `testnet/mcp-deposit-check.ts`: funds the test agent's deposit wallet, drives `deposit`, then
  `route_order` on the still-waiting note, then waits for the ASP.
- `testnet/mcp-client.ts`: drives the server over stdio like an agent's client (results in
  `docs/testnet.md`).
