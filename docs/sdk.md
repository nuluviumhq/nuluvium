# @nuluvium/sdk (session 1.6, 2026-11-15)

Package: `sdk/` (TypeScript, ESM). Used by the testnet scripts now, by the agent MCP server (1.7)
and the web app (1.8) next. Node 22.18+ runs the source directly (type stripping), so only
erasable TypeScript syntax is allowed (`erasableSyntaxOnly` in tsconfig).

```
cd sdk && npm test        # 11 unit tests (planner, note math, fresh keys, CID)
cd sdk && npm run typecheck
```

## Nothing secret is stored
One user secret (a BIP-39 mnemonic in v1; derived from a wallet signature in the web app) gives:
- **note keys**: Privacy Pools master nullifier and secret. Deposit `i` uses secrets from
  (scope, i); the change note after withdrawal `k` of a deposit uses secrets from (label, k);
- **fresh addresses**: one per piece at `m/44'/60'/1'/<deposit index>/<piece number>`.

`recoverNotes` rebuilds every note from the chain: it finds our deposits by their precommitment
hash in `Deposited` events, then follows `Withdrawn` events by spent nullifier hash
(Poseidon(nullifier)), checking each new commitment against the one on chain. A note taken back with
ragequit is marked spent (with `ragequitTx`): the `Ragequit` event names the commitment it spent,
which can be the deposit itself or a change note left after private withdrawals. Each note also
carries its `depositor`, the only address the pool lets ragequit it. Checked on testnet: recovered 15 + 15 + 8 tUSDG spendable and two ragequit
deposits, exactly what the earlier sessions left.

Only the schedule of an order (which pieces, when, status) is kept, on the user's device. It holds
no secrets but links the fresh addresses of one order, so it never goes to a server.

## Modules
| Module | Does |
|---|---|
| `keys` | mnemonic → note keys; fresh account per (deposit, piece); `depositAccount` (account 0, the wallet an agent deposits from) |
| `notes` | `recoverNotes`, `noteAfterWithdrawal` (change math), nullifier hash |
| `planner` | `planPieces`: N pieces, random sizes (min each + random weights 0.5 to 1.5), random times in the window with a minimum gap; injectable randomness for tests |
| `proof` | `createProver(artifactFolder)`, `proveWithdrawal`, `formatProof` (pB swapped for the contracts) |
| `asp` | `fetchApprovedSet`: document checked against its CID and its root against the chain; when the ASP status lags a new root (Cloudflare KV, up to about a minute), the CID comes from the Entrypoint's `RootUpdated` event in the last 10,000 blocks |
| `relayer` | `getQuote` (first relayer that answers, random order), `quoteFrom`, `signOrder` (EIP-712), `signPermit` (EIP-2612, token's own domain), `sendPiece` / `sendSell` with failover to the other relayers |
| `quote` | `quoteSwap` (QuoterV2 `quoteExactInputSingle` at the Router's `poolFee` tier, eth_call), `quotedBuy` (a fresh quote per piece less slippage), `quotedSellMinimum`, `withSlippage` |
| `routing` | `executePiece` (one piece end to end), `runPlan` (pieces on schedule, retries up to 3 times when the ASP root or state tree moved) |
| `deposit` | `depositUsdg` under the next unused deposit index (`walletClientFor` in `chain` signs locally) |
| `exit` | `ragequitNote` (commitment proof, simulated, then sent by the depositing wallet), `sellAtQuote` (minimum from a fresh quote), `sellFromFresh` (order + permit signed by the fresh address, sent through the relayer's `POST /sell` to `Router.swap`; the USDG stays on that address) |

## Rules worth knowing
- Pieces from one note run one after another: each spends the change of the previous one.
- The withdrawal's relay fee is 0; the relayer is paid once, through the Router, in USDG. The order
  allows up to twice the quoted fee so a small quote change does not fail the piece.
- Minimum out comes from a QuoterV2 quote taken for each piece at the tier the Router swaps on, less
  the order's slippage (web app 1%, MCP 0.1 to 5%). Testnet has no Uniswap: `config.quoter` is a
  stand-in (`MockQuoterV2`, contracts/test/mocks) that quotes the fixed-price mock router, so the
  same code path runs on both networks. Each relayer quotes again and refuses a minimum more than
  5% below its own quote.
- Several relayers (`config.relayerUrls`): the order is random per piece, so no single relayer sees
  every piece of an order; one that failed in the last two minutes is tried last. If the chosen
  relayer is down or refuses, the same proof and signatures go to the next one without a new proof:
  the withdrawal's relay fee is 0 (its `feeRecipient` gets nothing) and the Router pays its fee to
  whoever sends the transaction. The next relayer is asked for its own quote first; its fee must
  stay within the signed `maxFee`.
