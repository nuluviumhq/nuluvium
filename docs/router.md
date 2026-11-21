# NuluviumRouter (session 1.4, 2026-11-15)

Contract: `contracts/src/NuluviumRouter.sol`. The only new on-chain logic in v1; Privacy Pools stays
unchanged.

## What it does
Executes one piece of a private order for a fresh address that holds no ETH:
1. The fresh address signs an **EIP-2612 permit** (token in, amount, spender = Router) and an
   **EIP-712 order**: owner, token in, token out, amount in, minimum out (net, after the relayer
   fee), maximum relayer fee, nonce, deadline.
2. A relayer calls `swap(order, orderSignature, permit, fee)` and pays the gas.
3. The Router checks the order, pulls the tokens with the permit, swaps on the stock token's
   USDG pool (Uniswap v3 SwapRouter02, `exactInputSingle`) and pays out:
   - **buy** (USDG → stock): relayer fee out of the USDG paid in, stock tokens straight to the owner;
   - **sell** (stock → USDG): relayer fee out of the USDG received, the rest to the owner.

## Rules the contract enforces
- One side of every order is USDG; the stock token must be on the owner-managed allowlist
  (token → fee tier). `setPoolFee` only accepts a tier whose pool exists in the Uniswap factory.
- Signed terms cannot be changed by the relayer (signature check); each (owner, nonce) works once;
  deadline in unix seconds (timestamps, not `block.number`, which is the L1 block on this chain).
- Relayer fee ≤ the signed maximum, and on a buy below the amount in.
- Minimum out is enforced by Uniswap (`amountOutMinimum`); on a sell the Router asks Uniswap for
  minimum + fee, so the owner always gets at least their signed minimum.
- Never holds funds or allowances after a call. A permit that someone submitted early does not
  block the order (the allowance is already there).
- Not upgradeable. The owner (testnet: deployer key; mainnet: a Safe multisig) can only change the
  allowlist and pause. It has no function that moves user funds.

## Decision (user, 2026-11-15)
Sell proceeds go to the same fresh address. Depositing them straight back into the shielded pool
would make the Router the recorded depositor (ragequit and ASP screening would then run through
the Router), so that design waits for its own session and the auditor's input.

## Tests (`cd contracts && forge test`)
- `test/NuluviumRouter.t.sol`, 14 unit tests with mocks: buy and sell with fees, wrong signer,
  changed terms, replay, deadline, fee above maximum, minimum out, token not allowed, stock to
  stock, owner-only allowlist with pool check, pause, front-run permit, fuzz (500 runs) that the
  Router never keeps funds or allowances.
- `test/NuluviumRouterFork.t.sol`, 3 fork tests on **mainnet state** (real USDG, NVDA, SwapRouter02,
  QuoterV2): a fresh key with 0 ETH buys **0.6207 NVDA for 99.5 USDG** (exactly the quote) and sells
  it back for **98.90 USDG** (100 in; the gap is two 0.5 USDG relayer fees plus the pool fee);
  a minimum above the quote reverts with "Too little received" and the owner keeps the USDG.

## Findings
- USDG/NVDA has pools at **all four tiers** (0.01%, 0.05%, 0.3%, 1%). The allowlist pins one tier
  per token, so the deepest pool must be chosen when listing (Phase 0 data: NVDA 0.05%). Re-check
  liquidity before mainnet listing; a later version could route by quote across tiers.

## relayAndSwap (session 1.5)
`relayAndSwap(withdrawal, proof, scope, order, orderSignature, permit, fee)` calls `Entrypoint.relay`
(the Router is not the processooor; the Entrypoint pays the fresh address) and then the buy, in one
transaction. It checks that the withdrawal pays the order owner and that the order is a buy; the
withdrawal terms themselves are bound to the proof. If the buy fails, the withdrawal reverts too.

## Listing (2026-11-21)
`scripts/list-tokens.mjs` (local tool) reads each token's v3 USDG pools at the four tiers, quotes buys
of 100 and 1,000 USDG on QuoterV2, picks the tier with the most tokens out at 1,000 and compares it
with `poolFee`. Changes become a Safe Transaction Builder batch of `setPoolFee` calls, simulated as
the Safe; it never sends anything. Token lists often name a Uniswap v4 pool (32-byte id) as the price
pool; the Router ignores those, only v3 pools count.

## Not done yet
- Mainnet deploy, Safe as owner (testnet: done 2026-11-21).
- Deploy on testnet: no official Uniswap there, so a testnet Router needs our own MockUSDG/stock
  pool; it is a smoke test only, the fork tests are the real check.
