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

## Router v2, the relayer registry and tNLV (2026-11-23)

The relayer model from `docs/token.md` ("Testnet build of the relayer model"), testnet only. Router v1
stays deployed and unchanged; v2 is a new contract at a new address. The Privacy Pools contracts are
unchanged.

**`src/TestNLV.sol`**: "Test NLV" (tNLV), 18 decimals, no value. No owner, no premint. The only way to
get it is `claim()`: 1,000 tNLV to the caller, once per address per 24 hours. A relayer gets its bond
by calling `claim()` from its own key (`script/BondRelayerTestnet.s.sol` does claim, approve and
register in one run). Traders never touch it.

**`src/RelayerRegistry.sol`** (owner: the Safe, two-step hand-over):
- `register(url, amount)`: open to anyone with at least `MIN_BOND` (1,000 tNLV, one claim) and an
  HTTPS URL of at most 200 bytes. `addBond`, `setUrl` while active.
- Leaving: `requestUnbond()` stops the relayer at once (Router v2 refuses it from that block);
  `withdraw()` returns the bond after `UNBOND_DELAY` = 7 days. The bond stays slashable during the wait.
- Owner: `slash(relayer, amount, reason)` sends that part of the bond to the Safe; an active relayer
  left below `MIN_BOND` is removed. `remove(relayer, reason)` stops a relayer without taking bond.
  **Both are decisions of the Safe signers in v1, not automatic**: nothing on chain proves misbehaviour.
  A removed relayer can register again after it withdraws; there is no ban list.
- Read: `activeRelayers()` → `(address relayer, string url, uint256 bond)[]` (order changes when
  relayers leave), `isActive`, `relayerOf`, `activeCount`.

**`src/NuluviumRouterV2.sol`**: v1 plus:
- `swap` and `relayAndSwap` revert `NotARegisteredRelayer(caller)` unless `registry.isActive(msg.sender)`.
- Protocol fee `PROTOCOL_FEE_BPS` = 10 (0.1%) of the USDG side of the piece, on top of the relayer's gas
  fee: of `amountIn` on a buy, of the USDG received from the pool on a sell. `protocolFeeFor(usdg)`
  returns it (rounded down).
- Split (**decision: 50/50, the proposal**): `RELAYER_SHARE_BPS` = 5000. The relayer that sends the
  piece gets gas fee + half the protocol fee in one transfer; the odd unit and the other half go to
  `TREASURY` (the Safe). Why 50/50: the relayer does the work and pays the gas, so its share should
  be big enough to run one; the treasury half funds audits and running costs. Fee rate, split,
  treasury and registry are immutable: changing them means a new Router, so a trader's signed order
  always meets the terms it was signed against.
- `minAmountOut` is net of both fees. On a sell the Router checks it after the protocol fee
  (`TooLittleReceived(amountOut, minAmountOut)`); Uniswap's own minimum is only a first bound.
- `maxFee` still caps the gas fee only; the protocol fee is fixed by the contract.
- EIP-712 domain `("Nuluvium Router", "2")`: v1 signatures do not work on v2. Same `Order` struct
  and typehash. New `Swapped` event: `(owner, nonce, tokenIn, tokenOut, amountIn, amountOut, fee,
  protocolFee, relayer)`, with `relayer` indexed.
- Owner powers are the same as v1: allowlist and pause.

**Tests** (`forge test`; fork tests with `FORK_TESTS=true`):
- `test/RelayerRegistry.t.sol`: 12 tests (tNLV claim and cooldown; registry bond, URL checks,
  double registration, unbond delay, slash to the Safe and removal below the minimum, slash during
  unbond, owner-only, active list after the middle one leaves, fuzz that the registry holds exactly
  the bonds).
- `test/NuluviumRouterV2.t.sol`: 21 tests (fee split on buy, sell and relayAndSwap with exact amounts;
  rounding; sell minimum after the protocol fee; unregistered, leaving and removed relayers refused;
  v1 domain refused; v1 checks kept; fuzz that fees add up and the Router stays empty).
- `test/NuluviumRouterV2Fork.t.sol` (mainnet state, real USDG/NVDA 0.05% pool): a registered relayer
  buys **0.7330 NVDA for 99.8 USDG** (100 in, 0.10 gas fee, 0.10 protocol fee, exactly the quote)
  and sells it back for **99.50 USDG**; relayer 0.15 and treasury 0.05 on the buy.
- `test/NlvTestnetFork.t.sol` (live testnet state): runs the deploy and the Safe batch with the same
  code as the scripts (`script/NlvTestnetSetup.sol`), bonds relayers 1 and 2, sends a buy and a sell on
  the live tUSDG/MSTK/mock router, checks the split, that only the Safe can run the batch, that the
  deployer has no power once the Safe accepts, and that Router v1 is untouched.
- Gas: a v2 piece costs about 27,000 more than v1 in the unit tests (registry read plus the treasury
  transfer).

**Finding:** between the deploy and the Safe batch, the deployer is still owner of the registry and
Router v2 (two-step hand-over, as with v1 on 2026-11-21). The deploy script lists nothing; the
pending owner is the Safe, and the deployer cannot accept for it.

## Not done yet
- Mainnet deploy, Safe as owner (testnet: done 2026-11-21).
- Deploy on testnet: no official Uniswap there, so a testnet Router needs our own MockUSDG/stock
  pool; it is a smoke test only, the fork tests are the real check.
