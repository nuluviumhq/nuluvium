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

## Use it in Claude Code (testnet)
1. Once: `cd testnet && npm install && node setup-artifacts.mjs`, and `npm install` in `sdk/` and `mcp/`.
2. Set the agent's secret in your shell (testnet mnemonic, not a real wallet), e.g. in PowerShell
   `$env:NULUVIUM_MNEMONIC = "<twelve words>"`, then start `claude` from the repo root.
   `.mcp.json` passes it through as `${NULUVIUM_MNEMONIC}`; the file itself holds no secret.
   If your network blocks `*.robinhood.com`, also set
   `$env:NULUVIUM_RPC_URL` to your own testnet RPC (e.g. Alchemy), or use a VPN.
3. Approve the `nuluvium` server when Claude Code asks, then try:
   "Check my Nuluvium balance, then buy 5 USDG of MSTK in 3 pieces over 4 minutes."

Claude Desktop: add the same block to `claude_desktop_config.json` with an absolute path to
`mcp/src/server.ts` and the mnemonic in `env` (that file stays on your machine).

## npm package `@nuluvium/mcp` (built, not published yet)
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
- To publish: an npm account and a free `nuluvium` organization (the user's); then `npm publish` from
  `mcp/`. After it: check `npx -y @nuluvium/mcp --prepare` from the registry, remove the "Not on npm
  yet" note, and switch the setup in README, this file, /docs/agents, /for-agents and the app's Agents
  page to npx.

## Tests
- `cd mcp && npm test`: order status, store persistence, deposit rules, note approval and choice, circuit file download.
- `testnet/mcp-deposit-check.ts`: funds the test agent's deposit wallet, drives `deposit`, then
  `route_order` on the still-waiting note, then waits for the ASP.
- `testnet/mcp-client.ts`: drives the server over stdio like an agent's client (results in
  `docs/testnet.md`).
