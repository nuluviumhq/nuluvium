# Robinhood Chain testnet (checked 2026-11-15, session 1.1)

## Network
- Chain id 46630 (0xb626), RPC `https://rpc.testnet.chain.robinhood.com`, gas price about 0.01 gwei.
- Explorer (Blockscout): `https://explorer.testnet.chain.robinhood.com` (API at `/api/v2`).
- Faucet: faucet.testnet.chain.robinhood.com (Alchemy also has one).
- Present on testnet: Permit2, ERC-4337 EntryPoint v0.7, CreateX, Multicall3.
- None of the mainnet addresses we use (USDG, stock tokens, Uniswap, issuer registry) exist on testnet.

## Stock tokens (official)
All are EIP-1967 beacon proxies with the same implementation
`0xBd14156E05c6AF28ad39aA53a2AB8eB9CDf657DA` and the same creator
`0x2DD5b0Ea7c29006bA9450B9a4f3ADc234409e5Da`; 18 decimals; `DOMAIN_SEPARATOR` and `nonces` answer
(EIP-2612 permit, as on mainnet).

| Token | Address |
|---|---|
| TSLA | 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E |
| AMZN | 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02 |
| AMD | 0x71178BAc73cBeb415514eB542a8995b82669778d |
| PLTR | 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0 |
| NFLX | 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93 |
| WETH | 0x33e4191705c386532ba27cBF171Db86919200B94 (most holders; 0x7943e237... also exists) |

`isBlocked(address)` reverts when called on the testnet token itself; the blocking check lives in the
issuer registry on mainnet. Confirm the testnet equivalent in session 1.3 (ASP).

## USDG: no official one found
Explorer search shows many tokens named USDG / Global Dollar / Mock USDG, each from a different
deployer, none from the stock token creator. Anyone can deploy a token with that name, so none of
them can be trusted as "the" testnet USDG.

**Decision:** deploy our own `MockUSDG` (6 decimals, EIP-2612 permit, open mint) for sessions 1.2 to
1.6. Real USDG behaviour is tested against a mainnet fork instead (below).

## Uniswap: no official deployment found
Several Uniswap v3/v4 position managers and many `SwapRouter` contracts exist, all user-deployed.
**Decision:** on testnet, create our own pools (MockUSDG / stock token) on one of those v3 deployments
or our own, only to exercise the flow. Router correctness (prices, slippage, real pools) is tested in
Foundry **fork tests against mainnet state** (USDG, stock tokens, SwapRouter02, QuoterV2).

## What this means for the build
- 1.2 (shielded pool) runs on testnet with MockUSDG.
- 1.4 (Router) relies on mainnet fork tests; a testnet deploy is only a smoke test.
- The first fork test (`contracts/test/Permit.t.sol`) confirms that mainnet USDG and a stock token
  accept an EIP-2612 permit signed by a fresh key, the assumption the Router depends on.

## Session 1.2: Privacy Pools v1 on testnet

### What is used, unchanged
- `contracts/lib/privacy-pools-core`: git submodule of 0xbow-io/privacy-pools-core pinned to tag
  **v1.3.0** (commit c312dcd58f6ad085204be61923c49f8065e4e9ae). `git -C contracts/lib/privacy-pools-core
  status` must stay clean: no edits to upstream contracts or circuits.
- Solidity dependencies installed with npm at upstream's pinned versions (`contracts/package.json`);
  `.npmrc` sets `legacy-peer-deps` because upstream's yarn install accepts the same peer mismatch
  (contracts-upgradeable 5.0.2 next to contracts 5.1.0). `@zk-kit/lean-imt.sol` is installed under an
  npm alias because Foundry's remapper reads a folder named `*.sol` as a file.
- Circuits: upstream's trusted-setup final keys and compiled wasm, copied by
  `testnet/setup-artifacts.mjs`; the SDK (`@0xbow/privacy-pools-core-sdk` 1.5.0, same tag) checks
  every file against pinned SHA-256 hashes. No ceremony of our own.

### Upstream tests on our install
`FOUNDRY_PROFILE=upstream forge test --match-contract Unit` (from `contracts/`): **107 of 110 pass**.
The 3 failures are fuzz tests on the native ETH path, caused by newer Foundry behaviour, not by the
contracts: a mocked call carrying ETH now really moves the ETH (the Entrypoint keeps only the fee,
e.g. 46 vs 47 expected), and the fuzzer now finds the ETH placeholder constant as an ERC20 "token".
Same result with upstream's forge-std 1.9.6. Nuluvium only uses the ERC20 (USDG) pool.

### Our additions
- `contracts/src/MockUSDG.sol`: 6 decimals, EIP-2612 permit, open mint (max 1,000,000 per call).
- `contracts/script/DeployTestnet.s.sol`: upstream's deploy steps and CreateX salts, USDG pool only
  (minimum deposit 1 USDG, vetting fee 0, max relay fee 1%). One key holds owner, postman and
  relayer roles in 1.2.
- `contracts/test/DeployTestnet.t.sol`: 5 fork tests (pool registered, roles, deposit lands in the
  tree, minimum enforced, mint cap).
- `testnet/flow.mjs`: deposit, post the approved-set root, prove and relay a private withdrawal to a
  fresh address derived from the note mnemonic. Saves public data of each run to `testnet/runs/`.

### Findings
- **Arbitrum `block.number` is the L1 block** (about 12.1 M vs 153.6 M on L2). The deploy block is
  taken from forge's broadcast receipts instead. Contracts that rely on `block.number` for timing
  must keep this in mind (Router deadlines use timestamps).
- Git on Windows checks the `.vkey` JSON files out with CRLF, which breaks the SDK's hash check;
  the setup script restores LF.
- Withdrawal proof time on this laptop: 5 to 13 s (Node, snarkjs). Fine for a browser scheduler and
  for the agent MCP server.
- Rehearsed on a local anvil fork of testnet before the real run: partial withdrawal (25 in, 10 out,
  15 stays shielded) and full withdrawal both pass; the fresh address receives USDG and holds 0 ETH.

### Run it
```
cd contracts && forge script script/DeployTestnet.s.sol --rpc-url robinhood_testnet --broadcast --private-key $TESTNET_DEPLOYER_KEY
cd ../testnet && npm install && node setup-artifacts.mjs && node flow.mjs 25 10
```
`.dev.vars` (repo root, git-ignored) holds `TESTNET_DEPLOYER_KEY` and `TESTNET_NOTE_MNEMONIC`,
both throwaway testnet values. Testnet deployer: `0xbdED052e3Ebf14c6631497F867CB15fDb455170b`.

### Live on testnet (2026-11-15)
| Contract | Address |
|---|---|
| MockUSDG (tUSDG) | [0xd26d58F86cf82c702b558D6E7F159939E97F0Bfa](https://explorer.testnet.chain.robinhood.com/address/0xd26d58F86cf82c702b558D6E7F159939E97F0Bfa) |
| Entrypoint (proxy) | [0x1C7Bd821a61A90BA06e21aac4e03640E3D065536](https://explorer.testnet.chain.robinhood.com/address/0x1C7Bd821a61A90BA06e21aac4e03640E3D065536) |
| Entrypoint (implementation) | 0x362B7Fc530B1cF427778E79Bb670D99578401aa3 |
| USDG pool (PrivacyPoolComplex) | [0x2B38bF53acc21a51603E68f5BC3bC8943B01fD4a](https://explorer.testnet.chain.robinhood.com/address/0x2B38bF53acc21a51603E68f5BC3bC8943B01fD4a) |
| WithdrawalVerifier | 0x452ec534a1C765450f1E805fE1B8854Ca5aad8E8 |
| CommitmentVerifier (ragequit) | 0x1df3124F265B398Cd84630eA70eBb65d30Cc1c3a |

Pool scope 20883339666151915200592145183006062909365231028523521475069391119255857699183. Addresses
are deterministic (CreateX salts start with the deployer address). Deploy cost about 0.00008 testnet ETH.

First run (`testnet/runs/2026-11-15T10-40-10-133Z.json`), checked on the explorer:
1. [Deposit 25 tUSDG](https://explorer.testnet.chain.robinhood.com/tx/0x869aa2ed65681dee277bf779a5035fd173f8d1721e11619853688d7268b36bf0)
2. [Approved-set root posted](https://explorer.testnet.chain.robinhood.com/tx/0x77e97d9ceff97b7757a42246f6cd6255b61a03f74ec88b6eced319c775b8485d)
3. [Relayed private withdrawal of 10 tUSDG](https://explorer.testnet.chain.robinhood.com/tx/0x39c457d9510630a0f120c78314f443dac189010127fef443c087dc7794d945f4) (proof 10.3 s): the
   [fresh address](https://explorer.testnet.chain.robinhood.com/address/0xF528EDEb717124CEf539B4f42D2557A957F6d812) holds 9.95 tUSDG, 0 ETH, and has never sent a
   transaction. 15 tUSDG stays shielded as a new note.

Not private yet in this run, by design of the test: the same key deposited and relayed, and the pool
has one depositor. Unlinkability needs many depositors and separate relayer keys (1.3, 1.5).

## Session 1.3: approved-set provider (ASP)

- Code: `asp/` (screening in `src/screen.js`, Worker in `src/worker.js`, 7 unit tests: `npm test`).
- Live: https://asp.nuluvium.com (`/` status, `/sets/<cid>` published set).
  Cron every minute; posts a root only when the approved set changes (postman nonce stayed at 1 across
  later runs). Fails closed when the OFAC list or the issuer check cannot be read.
- Checks per deposit, in chain order: OFAC SDN ETH addresses (daily list by 0xB10C from Treasury data,
  123 addresses, cached in KV, refuses a list under 50 entries), issuer registry `isBlocked`
  (testnet registry 0x1dF3cA0fD30ED5eeb09eB01938f4E9c5196E6Ca5), our denylist, $1,000 per deposit,
  $25,000 approved in total. Only the depositor address is screened in v1.
- Postman 0xD40CA7EE663FddFc02d170E5e81bAe6D3a5B3E32 holds ASP_POSTMAN; the deployer renounced it.
  Worker secrets: POSTMAN_KEY, PRIVATE_RPC_URL.
- **RPC:** the public testnet RPC answers 429 to Cloudflare Workers (shared outgoing IPs), so the Worker
  uses an Alchemy URL (secret). The testnet uses a shared Alchemy key
  for now; a key of Nuluvium's own is needed before mainnet.

### Demo run (`testnet/runs/asp-demo-2026-11-15T11-04-09-482Z.json`)
Published set: [bafkreigtrmgqjsdxtlf6fzivnhhlwwtd3faqmtfqv6cp5xsclpdd7zc7vm](https://asp.nuluvium.com/sets/bafkreigtrmgqjsdxtlf6fzivnhhlwwtd3faqmtfqv6cp5xsclpdd7zc7vm),
[root posted by the postman](https://explorer.testnet.chain.robinhood.com/tx/0x3bcfeb79f82eda8890cae88c8188a6f37721694e423818a9039535266ebf1a0c). The script checks the
document against its CID (SHA-256) and the root against the chain.

| Deposit | ASP decision | Result |
|---|---|---|
| [A: 25 tUSDG](https://explorer.testnet.chain.robinhood.com/tx/0x9d560ae2bd80864a9347d31c5b856d6a581850be302af4060990d56269a4c9dc) | approved | [private withdrawal of 10](https://explorer.testnet.chain.robinhood.com/tx/0xb5273db467cde1984d4459e6150ce56e5d7a7b1bc47500bff5226895e44cadb9): fresh address got 9.95, 0 ETH |
| [B: 1,001 tUSDG](https://explorer.testnet.chain.robinhood.com/tx/0x0e72051ff538e86515d6f24e637637ca6f87138889fd1be6b78f8ee845dfe3ff) | above the per-deposit cap | no withdrawal proof possible; [ragequit](https://explorer.testnet.chain.robinhood.com/tx/0x4cda22e3d0fd6940e355019ba3f6e24bac2eacbf7a753c94998519da0c4d29da) returned 1,001 to the depositor |
| [C: 10 tUSDG](https://explorer.testnet.chain.robinhood.com/tx/0x98fe16410ae1084999f9e3d1cf6a4a868b3cbd44971771e0ffa7874b8aa9386f) from the denylisted key | on the Nuluvium denylist | no withdrawal proof possible; [ragequit](https://explorer.testnet.chain.robinhood.com/tx/0xf6baf042b44574f41efcde1640f0be4f5fbab4179e352210137a176d6d9af8f2) returned 10 to its wallet |

Not shown live: an issuer block (we cannot make the issuer block a testnet address; the check runs on
every deposit and is unit tested).

## Session 1.5: relayer and one piece in one transaction

- Router change: `relayAndSwap` runs `Entrypoint.relay` (USDG to the fresh address) and the buy in
  one call; if the buy fails, the withdrawal is undone and the note stays shielded. 4 new unit tests
  (30 in the project). Router redeployed on testnet next to labelled mocks (no official Uniswap):
  NuluviumRouter 0x3287C2947f137c20c8BfeB628f800D23b8e5D155, mock stock MSTK
  0xf2a0289ec25994dC7d22461Afd1dF3B818A0E088, fixed-price mock swap router (180 tUSDG per MSTK)
  0x807035ba230A5713c2B98c07DB030030CE0A2b2a (`contracts/deployments/46630-router.json`).
- Relayer: `relayer/`, Worker https://relayer.nuluvium.com with
  `GET /quote`, `POST /piece` and (since 2026-11-16) `POST /sell`. One Durable Object sends transactions one at a time (no nonce
  clashes); simulates before sending; refuses below a 0.0005 ETH float. Stores nothing; Worker logs
  are off. Own key 0x7a7A1f77C957B7C926AA9baF6cE8fA334270c72F (0.003 testnet ETH float).
- Fee: flat USDG through the Router (withdrawal relay fee 0): max($0.10, gas × price × ETH × 1.2).
  Today $0.10; the gas part is $0.03.

### First piece (`testnet/runs/piece-2026-11-15T16-08-00-000Z.json`)
[Deposit 20 tUSDG](https://explorer.testnet.chain.robinhood.com/tx/0x57feaa468479765a5565e634ebe415cfb555cb5b1bcbf513675ee0bb4e9b1646) →
[approved by the ASP](https://explorer.testnet.chain.robinhood.com/tx/0x43bebce3bc3023e775b6f8a3cacebf0fbeb224021a6339beafb9297c4fb96667) →
[one relayed transaction](https://explorer.testnet.chain.robinhood.com/tx/0x65a1ae192f8371235cef3ef95c81339948707f3b483b3522be82fdea0c19db8d) from the relayer key:
12 tUSDG left the shielded pool and bought 0.0661 MSTK (= 11.90 / 180) for the
[fresh address](https://explorer.testnet.chain.robinhood.com/address/0x691B21ddB4dA9D418b0f8eB8922B12802901EDcb), which holds 0 tUSDG and 0 ETH. The relayer got
0.10 tUSDG. 8 tUSDG stays shielded. Gas used 717,538; proof 5.9 s.

### Findings
- **Alchemy caps eth_getLogs at 10,000 blocks.** The ASP now scans from a saved cursor in 10,000-block
  chunks (at most 30 a run) and saves the cursor only on new deposits or every 50,000 blocks, so KV
  writes stay far under the free tier.
- **viem error messages contain the RPC URL with its key.** One ASP error log printed it (Cloudflare
  logs, owner only). Workers now log only `shortMessage` and details. The key should
  be rotated.
- A load-balanced RPC can lag a block behind a receipt; checks read at the receipt's block.

## Session 1.6: SDK routes 5 pieces over 10 minutes

`testnet/route.ts` (only `@nuluvium/sdk`), run `testnet/runs/route-2026-11-15T16-34-35-000Z.json`:
[deposit 50 tUSDG](https://explorer.testnet.chain.robinhood.com/tx/0x8b20e6e3ffbd1114d1ed9cb541ba13475b10229972b5396b55843a3d02e118a3) (deposit 5), approved by the ASP, then
5 pieces of random size at random times, each to its own fresh address, all on the first attempt:

| Piece | Planned | Sent (UTC) | Amount | Fresh address | Got |
|---|---|---|---|---|---|
| 0 | 16:35:15 | [16:35:25](https://explorer.testnet.chain.robinhood.com/tx/0xb318741a9b560b9f6d6d7e937aacde85f716de668140e32e2c6cb5d3f84b4caf) | 10.99 | 0x07751C531F27830cE5BAdA54B57436B83845c2c9 | 0.0605 MSTK |
| 1 | 16:36:53 | [16:36:59](https://explorer.testnet.chain.robinhood.com/tx/0x32aa4de8f7a23925e1fca037e948321285ee8e09b40a5338017833ace77d97b3) | 9.64 | 0x9f5c91CF6e385D9166E62Dd701bc8e87361418fa | 0.0530 MSTK |
| 2 | 16:38:17 | [16:38:23](https://explorer.testnet.chain.robinhood.com/tx/0x8f946b67a7fd8ce6fe95631bf7a40aae82804810ef7a681e793aaa12a288f2e7) | 11.77 | 0xCd75c096C9d83B84AbDE1603c3Be481094944839 | 0.0648 MSTK |
| 3 | 16:40:56 | [16:41:02](https://explorer.testnet.chain.robinhood.com/tx/0x116af7d16e17dcda4104dd17bf036d2fcbc5612adbaccd73db52d32de1fdd0d6) | 8.86 | 0xD8560653806b488e34190CDAb44bF81AaE65f8b2 | 0.0487 MSTK |
| 4 | 16:43:27 | [16:43:34](https://explorer.testnet.chain.robinhood.com/tx/0x0e63684e4848550c60c65659f4ae5afede57647d5d8e7feedec9bace967ebfc3) | 8.74 | 0x6351ecA6F564b56Ee51DEebc66EA33360AAF53Cf | 0.0480 MSTK |

Every fresh address: expected MSTK (amount minus the 0.10 fee, at the mock price), 0 tUSDG, 0 ETH.
Gaps 84 to 159 s; sizes 8.74 to 11.77. Sending took about 6 to 10 s per piece after its time (proof).
`recover.ts` afterwards: deposit 5 spent after 5 chained withdrawals; other notes unchanged.

Privacy caveat for this run: one depositor and one relayer did everything on a near-empty testnet
pool, so these pieces are linkable by timing here. Unlinkability needs many users (anonymity set).

## Session 1.7: agent MCP server (2026-11-16)

`testnet/mcp-client.ts` drove `mcp/src/server.ts` over stdio like an agent's MCP client:
- tools listed: get_balance, route_order, cancel_order, get_orders, get_fills;
- `get_balance`: 38 USDG in notes 0, 1, 4 (15, 15, 8);
- `route_order` MSTK 6 USDG, 3 pieces, 3 minutes → paid from note 4 (smallest that fits); a second
  order was cancelled at once (2 pieces cancelled); `route_order` TSLA was refused (not allowlisted);
- pieces went out on schedule and `get_orders` went scheduled → routing → done:
  [2.01 USDG](https://explorer.testnet.chain.robinhood.com/tx/0x2cddb7a7a8766c982a67699f8f7cb38b23980887065d81233b6c2f1243fc31df),
  [2.20 USDG](https://explorer.testnet.chain.robinhood.com/tx/0x8fe4b104dbe918f7aed6d66e38ed8752db41b653bfa1892292b88c8ed6affcbd),
  [1.79 USDG](https://explorer.testnet.chain.robinhood.com/tx/0xd7eed737dadcd7b5aae88ee6889b52bd963c9f71ea2d35680876b6a81bf3ca97), each to its own fresh address,
  0.10 fee each, MSTK received as expected; `get_balance` after: 32 USDG.

### MCP deposit tool (2026-11-17)
`testnet/mcp-deposit-check.ts` funded the test agent's deposit wallet (account 0 of its mnemonic) with
5 test USDG, then over stdio: `deposit` 0.5 and 1001 were refused with their reasons; `deposit` 3 sent
approve + deposit and returned note 6
([tx](https://explorer.testnet.chain.robinhood.com/tx/0x58b894feada42ed15c10eff47067a0f0cc9bfe71f61c43011dd77716d83559ee));
`get_balance` went from 32 USDG in 3 notes to 35 USDG in 4, deposit wallet 5 → 2 USDG.
Second run, with approval-aware notes: `deposit` 16 → note 8
([tx](https://explorer.testnet.chain.robinhood.com/tx/0x49bd5dfd42d1c480171a3a8120b7dd4158259e1007e2ca44fbe94d5c27aa0df8));
`get_balance` right after: 54 USDG total, 38 approved, note 8 "waiting"; `route_order` 16 USDG at once
was refused ("still waiting for the clean-funds check"); 20 s later note 8 was approved.

### Finding: some networks block robinhood.com
From 2026-11-16 a consumer ISP filter in use here redirects every `*.robinhood.com` host,
including both chain RPCs and the explorer, and intercepts DNS (even queries to 1.1.1.1). Cloudflare
Workers and `robinhood-testnet.g.alchemy.com` stay reachable. Local tools now take their own RPC
(`NULUVIUM_RPC_URL`, `TESTNET_RPC_URL` in `.dev.vars`). **The web app must not depend on
`*.robinhood.com` from the visitor's browser**: read the chain through our own RPC proxy.

## Session 1.8c: deposit and trade from the browser (2026-11-16)

Driven in the web app (next dev) with the public test wallet (BIP-39 "test … junk", account 0) through
`testnet/test-wallet-server.mjs` (signs and sends locally; the page only forwards wallet requests):
1. Unlock → 10.00 tUSDG, deposit #0 approved.
2. "Get 100 test USDG" (mint from the wallet) → wallet 100.00 tUSDG.
3. [Deposit 25 tUSDG](https://explorer.testnet.chain.robinhood.com/tx/0xc910f3e58f1f4c11a1afa05fc696916ca291d6cdebe5) from the wallet (approve + deposit) → note #1 "Waiting
   for approval", approved by the ASP within the minute, page updated by itself.
4. Trade: 6 tUSDG of MSTK in 3 pieces over 10 min → order R-B3D0EA. Pieces planned at random sizes and
   times and sent from the browser (proof built in the browser, about 14 s from start to receipt):

| Piece | Spent | Received | Fresh address | Transaction |
|---|---|---|---|---|
| 1 | 2.47 | 0.0132 MSTK | 0xc6380aA6640Fdf75b778992f994235A670998EBd | [0xb56bb2ef…](https://explorer.testnet.chain.robinhood.com/tx/0xb56bb2ef7479580ea2ec68fe9e17f3a36bef40fd65d7cd57a0a576f0b4c87d6d) |
| 2 | 1.94 | 0.0102 MSTK | 0x6da8D178922ad66EB223d24990c2751372794dFF | [0x2314b760…](https://explorer.testnet.chain.robinhood.com/tx/0x2314b760dbe11a8f2910e714cfd1103c63d109b3fcfaaea1e3aec65ad53a6048) |
| 3 | 1.59 | 0.0083 MSTK | 0xD4457FF1712207D65Ed0466b25185ec2554c5D00 | [0x4de421a2…](https://explorer.testnet.chain.robinhood.com/tx/0x4de421a275bf0982de8c6be3f6391e0ff8ce21b0821bc0893b26aaa2c724f7de) |

Checked on chain: each fresh address holds exactly its MSTK, 0 tUSDG, 0 ETH, and never sent a
transaction; all three transactions are from the relayer to the Router (the test wallet appears in none).
The browser keeps the order schedule only encrypted (AES-GCM, key from the Nuluvium keys): no
address, token or order id is readable in local storage.

## Web app live on testnet (2026-11-16)

https://nuluvium.com (Worker darkpool-web-testnet, OpenNext; secret
PRIVATE_RPC_URL; noindex). Checked after deploy: all 12 pages 200 and 404 for unknown paths; /api/rpc
answers chain 46630 and refuses signing methods; hero video answers byte ranges (206); the 17.8 MB
circuit file is served whole; login with the public test wallet shows its 29.00 tUSDG (notes #0 and #1,
both approved), the browser contacting only our own Workers.
Not checked: the 451 page from a blocked country (needs a request from one).

## Ways out: ragequit, holdings, sell, key export (2026-11-16)

- SDK fix: `recoverNotes` matched a ragequit only on a deposit with no withdrawals, so a change note
  taken back after pieces would still have counted as spendable. It now matches the commitment named
  by the `Ragequit` event (`sdk/test/recover.test.ts`).
- `testnet/exit-check.ts` (public test wallet's keys, deployer as depositor and in the relayer's place):
  - [deposit #3 of 2 tUSDG](https://explorer.testnet.chain.robinhood.com/tx/0xc54bda669fd4bba85c878e3f792112093e587c744f662a70de8a84aa316f8f00),
    [ragequit](https://explorer.testnet.chain.robinhood.com/tx/0xab39dd6153a99f9ccfceaf7be96c9730c74c558bb46b4ae39f438de8042eb289):
    the wallet got 2 back, `recoverNotes` shows #3 spent with its ragequit transaction.
  - [sell](https://explorer.testnet.chain.robinhood.com/tx/0xeeaf6701e6b795c23ebb4776d2cf7ae19096bdbd5b8bbaf8fd94f84f9a6321b7)
    of 0.0102 MSTK from fresh address 0x6da8…4dFF through `Router.swap`: +1.74 tUSDG on the address
    (sale 1.84 minus the 0.10 fee), 0 MSTK left, 0 ETH on the address. An earlier run sold piece 1's
    MSTK on 0xc638…8EBd the same way (2.26 tUSDG now on it).
- Web app (next dev, public test wallet through `test-wallet-server.mjs`): Holdings on Orders found
  the 3 fresh addresses of order R-B3D0EA with their balances; Export key showed the key after a
  warning; Take back on Overview
  [returned deposit #1's 25 tUSDG](https://explorer.testnet.chain.robinhood.com/tx/0x4009a91613d7e4f3e03da42b94f6b93105d6c097811972c42425ed47a1f1f71a)
  to the wallet (wallet 75 → 100), and deposit #0, made by the deployer, shows "Other wallet".
- Relayer `POST /sell` (Router.swap, sells for USDG only), deployed 2026-11-16: `sellFromFresh`
  against the live relayer
  [sold 0.0083 MSTK](https://explorer.testnet.chain.robinhood.com/tx/0xc962221e494c9058aca60fe060bd77d07664ad9b0f3978009ea18aa880cb5f01)
  on fresh address 0xD445…5D00: +1.39 tUSDG (sale 1.49 minus the 0.10 fee), 0 ETH on the address.

## Faucet (2026-11-19)

`faucet/`, Worker at https://faucet.nuluvium.com, key `0x03E43b3Ae6f59C9A87738F546c78b02632Ffc114`
(funded with 0.001 test ETH from the deployer, about 50 drips). `POST /drip {address}` sends 0.00002
ETH when the wallet holds less than half that (an approve plus a deposit cost about 0.000004 ETH)
and mints 100 tUSDG, so a new wallet can deposit without any other faucet. Limits: once per wallet
per day, 3 per visitor per day (salted IP hash, stored apart from the wallet), 300 per day, a
0.00005 ETH reserve, Cloudflare burst limit 3 a minute; other websites' Origins refused, blocked
countries refused (same list as the app). Logs off. Checked live: a new wallet got
[0.00002 ETH](https://explorer.testnet.chain.robinhood.com/tx/0x95784d87abc6c479f0e5906ace264707ab856a9627019f18968fcd26f4610932)
and [100 tUSDG](https://explorer.testnet.chain.robinhood.com/tx/0x69e0f45eaa33c656f91a92084400076a0a767a6433876dcb6feb2f792f28d067);
a second request for it got 429; another Origin 403; a malformed address 400. The app's Overview
has a Get test funds button in place of the old Get 100 test USDG (which needed gas of its own).

