# Changelog

What changed in Nuluvium, newest first. Everything runs on Robinhood Chain testnet with test tokens.
Package versions on npm are named where a release went out with the change.

## 2026-11-26

- **@nuluvium/mcp 0.2.1**: the `deposit` tool suggests common sizes and adds a `sizeNote` with a split
  into common sizes when an amount is odd (advice only). The server reports its real version.

## 2026-11-25

### Site
- Landing: one real testnet order written out as a dated log, every transaction linked.
- Landing: "The one promise" band: no server knows which addresses are yours.
- Landing: an Owner Safe card next to Private / Not private / Testnet: it can pause swaps, never
  move a deposit or tokens.
- Landing hero: the title no longer clips the bottom of p and y.
- Stats: one tabbed panel (Pieces, Deposits, Relayers) with column charts; the relayer chart marks
  the gas alert line.

### App
- Overview: a step-by-step "Start here" guide at the top (test funds, deposit, clean-funds check,
  first order). Each step has one action and "Show me"; the guide moves on by itself from chain
  state and folds away when all four are done.
- Brand lockups for the login modal.

## 2026-11-24

- **Reason codes for refused deposits.** The approved-set provider publishes a stable code with every
  refusal (`OVER_DEPOSIT_CAP`, `OVER_TOTAL_CAP`, `SANCTIONED`, `ISSUER_BLOCKED`, `DENYLISTED`,
  `SOURCE_*`). The app explains a refused deposit in plain words with what to do next; stats count
  refusals by code.
- **Deposit-size guidance.** The app suggests common deposit sizes (10, 25, 50, 100, 250, 500, 1,000)
  and how to split an odd amount, so amounts are harder to pick out while the pool is small.
  `depositSizeAdvice` is in the SDK.

## 2026-11-23

- **Relayer model on testnet**: `TestNLV` (tNLV, test token), `RelayerRegistry` (bond to register,
  unbond delay, the owner Safe can slash and remove) and Router v2 with a 0.1% protocol fee per piece,
  split between the relayer that sent it and the treasury Safe. Relayers 1 and 2 are bonded; the SDK,
  MCP server and app pick relayers from the registry and keep failover. Slashing is a Safe decision
  in this version.
- **@nuluvium/mcp 0.2.0**: relayers from the registry, Router v2, protocol fee in `get_fills`.
- **@nuluvium/ai-sdk 0.1.0**: Nuluvium's tools for the Vercel AI SDK (`generateText({ tools })`),
  with a guide at nuluvium.com/docs/agents/ai-sdk.
- viem 2.57.17 across the SDK, MCP server and web app.

## 2026-11-22

- App: a split login screen (painting on the left; email code or wallet on the right) replaces the
  unlock modal; unlocking shows progress and stage messages.
- Fix: email logins could wait forever for the embedded wallet (newer wallet type not recognised;
  the wallet is now created if login did not create it).
- Docs and stats list both relayers, with each relayer's gas balance.
- Web dependencies: npm audit fix (46 to 14 findings; the rest triaged in `docs/review.md`).

## 2026-11-21

- Owner roles (Router owner, Entrypoint owner) held by a Safe 2-of-2.
- Quoted minimum out for every piece (Uniswap QuoterV2), checked again by the relayer.
- Second relayer with client failover; gas float alert for each relayer.
- Approved-set provider: screens the source of funds one hop back; approved sets pinned to IPFS.
- Stats: running totals instead of every event.
- Proof page reads the owner from the chain.
- Inner pages: one layout per page.

## 2026-11-20

- Landing: one idea per screen, duotone art, an opening sequence, reveal on scroll, transitions
  between pages.
- Approved-set provider commits every posted set to the approved-sets archive.
- **@nuluvium/mcp 0.1.1** in the MCP Registry as `com.nuluvium/mcp`.
- Web Worker bundle from 2.5 MB to 1.2 MB gzip (SDK kept out of the server bundle).

## 2026-11-19

- First public release: private routing for stock tokens on Robinhood Chain testnet. Shielded USDG
  balance (Privacy Pools v1.3.0, unchanged), approved-set provider, relayer, Nuluvium Router, SDK, web
  app and docs.
- Testnet faucet and "Get test funds" in the app.
- **@nuluvium/mcp 0.1.0**: MCP server for agents (`npx -y @nuluvium/mcp`).
