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
| contracts | `forge test` | 18 pass offline; 12 more fork tests run with `FORK_TESTS=true` (30/30 against both chains) |
| sdk | typecheck, `npm test` | 17 pass |
| mcp | typecheck, `npm test`, `npm pack --dry-run` | 13 pass |
| relayer | `npm test` | 8 pass |
| asp | `npm test` | 7 pass |
| stats | `npm test` | 7 pass |
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

## Claims and what they rest on

| Claim | Where it holds | Proof |
|---|---|---|
| Trades do not trace back to the depositor, from other readers of the chain | Shielded pool + a fresh address per piece + relayer pays gas | Pool: Privacy Pools v1.3.0 unchanged (`contracts/lib/privacy-pools-core`). Fresh addresses: `sdk/src/keys.ts` `freshAccount` (`m/44'/60'/1'/deposit/piece`). Testnet: [piece from a fresh address holding 0 ETH](testnet.md) |
| …but only as private as the crowd | Few deposits let timing and amounts point a piece to its deposit | Said on the site, the stats page (under 50 approved deposits) and the README; [live crowd size](https://nuluvium.com/stats) |
| Not private from Robinhood | Stock tokens are issued by Robinhood | Stated in the README, the site and the app |
| Orders are split into random sizes at random times | `sdk/src/planner.ts` | `sdk/test/planner.test.ts`; the stats page's piece-size chart |
| No server stores which fresh addresses belong to whom | Keys are made on the user's device; the relayer only sees one piece at a time | `web/components/app/session.tsx`, `web/lib/deviceKeys.ts` (email logins), `mcp/` runs on the agent's machine. Relayer: no storage, `observability: false` in `relayer/wrangler.jsonc`. Stats: totals only (`stats/src/aggregate.js`) |
| Privy (login) cannot rebuild the keys | Email logins use a random phrase made in the browser, never a signature of the Privy wallet | `web/lib/deviceKeys.ts`, `session.tsx` (`unlock`) |
| The relayer cannot change an order or take more than the signed fee | The fresh address signs the order (EIP-712) with its own price limit and fee cap | `contracts/src/NuluviumRouter.sol` `_swap` (signature, nonce, deadline, `maxFee`, `minAmountOut`); tests in `NuluviumRouter.t.sol`. The relayer also refuses `minAmountOut = 0` (`relayer/src/parse.js`) |
| Fee is 0.10 USDG per piece today | The larger of 0.10 USDG and gas + 20% | `relayer/src/fee.js`; live at `/quote` |
| Every deposit is screened; up to 1,000 USDG each, 25,000 in total | OFAC list, the issuer's blocklist, our denylist, beta caps | `asp/src/screen.js` + tests. Fails closed: if a list cannot be read, no root is posted (`asp/src/worker.js`). Every set: [approved-sets](https://github.com/nuluviumhq/approved-sets) |
| A deposit can always be taken back by its depositor | `ragequit` is on the pool contract itself, which is not upgradeable | Privacy Pools `PrivacyPool.ragequit`; `sdk/src/exit.ts`; testnet ragequits in [testnet.md](testnet.md) |
| Not offered in the US and restricted countries | Country check on the app and API | `web/lib/geo.ts` + test, `web/custom-worker.ts` (HTTP 451) |
| Fails closed when the approved set cannot be read | Notes count as waiting, not approved | Web: `web/lib/chain.ts` (`readShieldedBalance`); MCP: `route_order` refuses (`mcp/src/server.ts`) |

## Keys and what they can do

Testnet. All are single keys today; before mainnet the owner roles move to a Safe multisig.

| Key | Holds | Can | Cannot |
|---|---|---|---|
| Deployer `0xbdED…170b` (plain wallet) | Router owner; Privacy Pools Entrypoint `OWNER_ROLE` | Allow or remove stock tokens on the Router; pause Router swaps; upgrade the Entrypoint (UUPS proxy); wind down the pool (stops new deposits); change the postman; withdraw Entrypoint fees (vetting fee is 0) | Move anyone's deposit or tokens; change a signed order; stop `ragequit` (on the pool contract, not upgradeable); spend a note without its secrets |
| Postman `0xD40C…3E32` (ASP Worker secret) | Entrypoint `ASP_POSTMAN` | Post approved-set roots: approve, refuse, or drop a deposit from the set | Spend or move funds. A deposit left out of the set cannot be traded privately, but can still be taken back |
| Relayer `0x7a7A…c72F` (relayer Worker secret) | Sends Router transactions, receives the fee | Refuse or delay pieces and sells (censorship, downtime) | Change an order, raise the fee above the signed cap, or see more than the piece it sends. There is one relayer today; a second one is planned |
| Faucet `0x03E4…c114` (faucet Worker secret) | Sends test ETH and mints test USDG (the mock token's mint is open to anyone) | Send a little testnet ETH and mint test USDG to wallets that ask, within daily limits | Touch the pool, the Router, notes or anything on mainnet; it holds only a little testnet ETH |
| Web app (Cloudflare Worker) | Serves the app and the RPC proxy | Ship code that runs in users' browsers (as any web app can) | Read keys it never receives; the app works the same from a local build |

If every key above turned hostile, a depositor still gets their deposit back with `ragequit`, and
tokens already on a fresh address stay under that address's key.

## Known gaps

- Router owner and Entrypoint owner are one plain wallet (testnet). Mainnet: Safe multisig.
- One relayer: it can censor or go down. Mainnet: a second relayer.
- Minimum output for buys uses the mock's fixed price on testnet; mainnet needs a Uniswap quote.
- The web app has no UI tests; its tests cover pure logic (country check, chain reads, RPC policy).
- The npm package `@nuluvium/mcp` is built and tested but not published yet.
- No independent audit yet; deposits stay capped until there is one.
- The public history starts on 2026-11-16 with one commit: earlier work was in a private repository.
