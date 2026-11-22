# Review guide

For anyone checking Nuluvium: how to build and test everything, what each claim rests on, who holds
which key and what it can do, and what is not done yet. Testnet only (Robinhood Chain testnet,
test tokens). Last checked 2026-11-18 from a fresh clone.

## Build and test

```sh
git clone --recurse-submodules https://github.com/nuluviumhq/nuluvium.git && cd nuluvium
npm ci                                   # root: the linter
for p in contracts sdk mcp relayer asp stats faucet web; do (cd $p && npm ci); done
npm run check                            # lint + every typecheck and test suite
npm run check -- --build                 # also the web production build
```

Node.js 22.18+ (the SDK and MCP server run TypeScript directly) and Foundry. CI runs the same steps
on every push ([.github/workflows/ci.yml](../.github/workflows/ci.yml)).

| Package | Checks | Result |
|---|---|---|
| lint | Biome, recommended rules, whole repo ([biome.jsonc](../biome.jsonc)) | 0 errors; warnings are mostly `!` non-null assertions |
| contracts | `forge test` | 19 pass offline; 12 more fork tests run with `FORK_TESTS=true` (not re-run for this change) |
| sdk | typecheck, `npm test` | 27 pass |
| mcp | typecheck, `npm test`, `npm pack --dry-run` | 13 pass |
| relayer | `npm test` | 16 pass |
| asp | `npm test` | 36 pass |
| stats | `npm test` | 12 pass |
| web | typecheck, `npm test`, `next build` | 10 pass (pure logic only: no UI tests), build passes |

Fork tests read live chain state (stock token permits, the deployed pool). They are skipped unless
`FORK_TESTS=true`; `ROBINHOOD_MAINNET_RPC` and `ROBINHOOD_TESTNET_RPC` override the public RPCs,
which some networks block.

### Slither

`slither . --filter-paths "lib/|test/|script/"` in `contracts/` (Slither 0.11.6, 2026-11-18): 7 results.

| Detector | Where | Verdict |
|---|---|---|
| arbitrary-send-erc20-permit (high) | `_pullWithPermit`: `transferFrom(order.owner, …)` | False positive. `_swap` checks `order.owner`'s EIP-712 signature over this exact order and spends its nonce before pulling; only USDG and allowlisted stock tokens can be pulled. A permit that was already used (front-run) is skipped and the existing allowance is used, which the owner granted for this order. Tests in `NuluviumRouter.t.sol`: `test_revertsWhenSignedByAnotherKey`, `test_relayerCannotChangeSignedTerms`, `test_orderCannotBeReplayed`, `test_frontRunPermitDoesNotBlockTheOrder`. |
| timestamp | `block.timestamp > order.deadline` | Intended: orders expire. |
| cyclomatic-complexity | `_swap` (12) | Accepted: the checks are in one place on purpose, in the order they must run. |
| naming-convention (4) | `DOMAIN_SEPARATOR`, `USDG`, `SWAP_ROUTER`, `ENTRYPOINT` | EIP-2612 / immutable naming. |

The forked Privacy Pools contracts (v1.3.0, unchanged, pinned submodule) are not re-reviewed here;
see their own audits in the submodule.

### npm audit

`npm audit` in each package (2026-11-21). Root, contracts, stats and faucet: 0. The Worker bundle
holds none of the packages below: server code imports only `@nuluvium/sdk/config`, and the full SDK
and Privy load in the browser only.

**web: 46 (20 moderate, 26 high)**, from 8 root packages; the rest are the packages that depend on them.

| Package | Comes from | Runs in | Verdict | Fix |
|---|---|---|---|---|
| zod 3.x (memory on oversized input) | Privy → x402, Coinbase CDP SDK, Reown AppKit | Browser, login only | Low: the input is the user's own wallet and login data in their own tab | None in zod 3; needs Privy to move to zod 4 |
| decode-uri-component 0.2 (DoS on malformed percent-encoding) | Privy → WalletConnect → query-string | Browser, login only | Low: at worst the user's own tab hangs | Privy 3.52.0 (WalletConnect 2.26) |
| uuid 8/9 (bounds check when a buffer is passed) | Privy → MetaMask SDK | Browser, login only | Not reachable: called without a buffer | Privy 3.52.0 |
| ws 8.17/8.18 (memory) | ethers (zk-kit, SDK), WalletConnect | Node only | Not reachable: browsers use their own WebSocket, the Worker does not bundle it | Override to 8.23.0 |
| underscore 1.13.6 (recursion DoS) | SDK → snarkjs → bfj → jsonpath | snarkjs file reading | Not reachable: proofs load their files from memory | Override to 1.13.8 |
| undici 7.29 | wrangler → miniflare | Local dev only | Not shipped | wrangler 4.166.0 |
| glob 10.3, minimatch 9 | OpenNext → node-minify | Build only | Not shipped | OpenNext 1.20.18 (node-minify 10) |
| glob 13, minimatch 10 (AbortSignal, globparts DoS) | OpenNext | Build only | Not shipped; the build passes its own patterns | None in glob 13 |

Fix **installed 2026-11-22**: Privy 3.51.0 → 3.52.0, OpenNext 1.20.12 → 1.20.18, wrangler
4.151.0 → 4.166.0, overrides for `ws` and `underscore`, and viem 2.57.8 → 2.57.17 (Privy 3.52 pins it),
held to one version with a `viem` override (`npm ls viem`: one version). **web is now 14 (3 moderate,
11 high)**: zod 3 in Privy's tree, and glob/minimatch in the build. No major upgrades. All checks and the
web build pass; the Privy login opens as before. The SDK still uses viem 2.57.8 for its own tests.

**Other packages** (same trees): sdk 8 and mcp 9 (snarkjs/zk-kit: underscore, ws, ethers; mcp also
zod), asp 5 (zk-kit/ethers, viem → ws) and relayer 2 (viem → ws). All of them run in Node or a Worker
that makes HTTP calls only, so ws is not reachable. The same `ws`/`underscore` overrides would fix them there.

## Claims and what they rest on

| Claim | Where it holds | Proof |
|---|---|---|
| Trades do not trace back to the depositor, from other readers of the chain | Shielded pool + a fresh address per piece + relayer pays gas | Pool: Privacy Pools v1.3.0 unchanged (`contracts/lib/privacy-pools-core`). Fresh addresses: `sdk/src/keys.ts` `freshAccount` (`m/44'/60'/1'/deposit/piece`). Testnet: [piece from a fresh address holding 0 ETH](testnet.md) |
| …but only as private as the crowd | Few deposits let timing and amounts point a piece to its deposit | Said on the site, the stats page (under 50 approved deposits) and the README; [live crowd size](https://nuluvium.com/stats) |
| Not private from Robinhood | Stock tokens are issued by Robinhood | Stated in the README, the site and the app |
| Orders are split into random sizes at random times | `sdk/src/planner.ts` | `sdk/test/planner.test.ts`; the stats page's piece-size chart |
| No server stores which fresh addresses belong to whom | Keys are made on the user's device; the relayer only sees one piece at a time | `web/components/app/session.tsx`, `web/lib/deviceKeys.ts` (email logins), `mcp/` runs on the agent's machine. Relayer: no storage, `observability: false` in `relayer/wrangler.jsonc`. Stats: running totals only (`stats/src/totals.js`) |
| Privy (login) cannot rebuild the keys | Email logins use a random phrase made in the browser, never a signature of the Privy wallet | `web/lib/deviceKeys.ts`, `session.tsx` (`unlock`) |
| The relayer cannot change an order or take more than the signed fee | The fresh address signs the order (EIP-712) with its own price limit and fee cap | `contracts/src/NuluviumRouter.sol` `_swap` (signature, nonce, deadline, `maxFee`, `minAmountOut`); tests in `NuluviumRouter.t.sol`. The relayer also refuses `minAmountOut = 0` (`relayer/src/parse.js`) |
| Each piece's price limit comes from a fresh Uniswap quote | Clients quote QuoterV2 at the Router's tier for every piece (1% below by default); each relayer quotes again and refuses a minimum more than 5% below its own quote, or any piece it cannot quote | `sdk/src/quote.ts` + `sdk/test/quote.test.ts`; `relayer/src/bound.js` + `relayer/test/bound.test.js`. Testnet uses a stand-in quoter for the fixed-price mock (`MockQuoterV2`); testnet run in [testnet.md](testnet.md) |
| Two relayers; one that is down or refuses does not stop a piece | Same code, own key and gas float each; clients pick one at random per piece and send the same signed piece to the other when the first fails | `relayer/wrangler.jsonc` (env `second`), `sdk/src/relayer.ts` + `sdk/test/relayer.test.ts`; failover piece on testnet in [testnet.md](testnet.md) |
| Fee is 0.10 USDG per piece today | The larger of 0.10 USDG and gas + 20% | `relayer/src/fee.js`; live at `/quote` |
| Every deposit is screened; up to 1,000 USDG each, 25,000 in total | OFAC list, the issuer's blocklist, our denylist, beta caps; the depositor and, one hop back, the senders of its USDG (refused at 10% of the deposit or more) | `asp/src/screen.js`, `asp/src/trace.js` + tests. Fails closed: if a list or a source trace cannot be read, no root is posted (`asp/src/worker.js`). Every set: [approved-sets](https://github.com/nuluviumhq/approved-sets) |
| A deposit can always be taken back by its depositor | `ragequit` is on the pool contract itself, which is not upgradeable | Privacy Pools `PrivacyPool.ragequit`; `sdk/src/exit.ts`; testnet ragequits in [testnet.md](testnet.md) |
| Not offered in the US and restricted countries | Country check on the app and API | `web/lib/geo.ts` + test, `web/custom-worker.ts` (HTTP 451) |
| Fails closed when the approved set cannot be read | Notes count as waiting, not approved | Web: `web/lib/chain.ts` (`readShieldedBalance`); MCP: `route_order` refuses (`mcp/src/server.ts`) |

## Keys and what they can do

Testnet. Since 2026-11-21 the owner roles are held by a Safe 2-of-2; the other roles are single keys.

| Key | Holds | Can | Cannot |
|---|---|---|---|
| Safe 2-of-2 `0xDe29…fCB5` (SafeL2 1.4.1; the deployer `0xbdED…170b` held these roles until 2026-11-21) | Router owner; Privacy Pools Entrypoint `OWNER_ROLE` | Allow or remove stock tokens on the Router; pause Router swaps; upgrade the Entrypoint (UUPS proxy); wind down the pool (stops new deposits); change the postman; withdraw Entrypoint fees (vetting fee is 0) | Move anyone's deposit or tokens; change a signed order; stop `ragequit` (on the pool contract, not upgradeable); spend a note without its secrets |
| Postman `0xD40C…3E32` (ASP Worker secret) | Entrypoint `ASP_POSTMAN` | Post approved-set roots: approve, refuse, or drop a deposit from the set | Spend or move funds. A deposit left out of the set cannot be traded privately, but can still be taken back |
| Relayers `0x7a7A…c72F` (relayer 1) and `0x21Ad…55c0` (relayer 2), each its own Worker secret | Send Router transactions, receive the fee | Refuse or delay the pieces and sells sent to them (clients then use the other relayer) | Change an order, raise the fee above the signed cap, loosen the signed price limit, or see more than the piece they send. Both run by Nuluvium today: together they can still censor |
| Faucet `0x03E4…c114` (faucet Worker secret) | Sends test ETH and mints test USDG (the mock token's mint is open to anyone) | Send a little testnet ETH and mint test USDG to wallets that ask, within daily limits | Touch the pool, the Router, notes or anything on mainnet; it holds only a little testnet ETH |
| Web app (Cloudflare Worker) | Serves the app and the RPC proxy | Ship code that runs in users' browsers (as any web app can) | Read keys it never receives; the app works the same from a local build |

If every key above turned hostile, a depositor still gets their deposit back with `ragequit`, and
tokens already on a fresh address stay under that address's key.

## Known gaps

- Router owner and Entrypoint owner: a Safe 2-of-2 on testnet since 2026-11-21; the deployer holds neither role. Mainnet: the same setup.
- Two relayers, both run by Nuluvium: one going down no longer stops pieces, but together they can
  still censor. Independent operators are a later step.
- Testnet has no Uniswap: quotes come from a stand-in for the fixed-price mock router. The real
  QuoterV2 path is the same call; the listing script reads it on mainnet (`setPoolFee` per token at
  the tier that gives the most tokens for 1,000 USDG).
- The gas float alert is a Telegram message from each relayer's cron, sent only once the bot token
  and chat id are set as Worker secrets.
- The web app has no UI tests; its tests cover pure logic (country check, chain reads, RPC policy).
- No independent audit yet; deposits stay capped until there is one.
- Source-of-funds screening goes one hop back only: USDG that passed through a clean wallet first is not traced. It relies on Alchemy's transfers API (`alchemy_getAssetTransfers`); on another RPC the trace fails and deposits wait (fail closed).
- Approved sets are pinned to IPFS through one service (Pinata, free plan: 500 files). Mainnet: a second pin (another service or our own node).
- The ASP and the stats Worker keep one KV entry per deposit (the ASP's `scan`, the stats `deposits` list). That grows with deposits, not swaps, and deposits are capped; fine for the beta, not for open deposits.
- The public history starts on 2026-11-16 with one commit: earlier work was in a private repository.
