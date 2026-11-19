// @nuluvium/sdk: private routing on Robinhood Chain.
//   keys      one user secret → note keys and a fresh address per piece
//   notes     spendable notes rebuilt from the chain (nothing secret is stored)
//   planner   random piece sizes and times inside a window
//   proof     withdrawal proofs (Privacy Pools v1 circuits); Node folder prover in ./node.ts
//   asp       the approved set, checked against its CID and the on-chain root
//   relayer   quote, order and permit signatures, piece submission
//   routing   one piece end to end, or a whole plan on schedule
//   exit      ragequit a deposit back to its wallet; sell a fresh address's tokens for USDG

export { ROBINHOOD_TESTNET, type NetworkConfig } from "./config.ts";
export { KEY_MESSAGE_VERSION, depositAccount, freshAccount, isValidMnemonic, keyMessage, keysFromMnemonic, keysFromSignature, newMnemonic, type UserKeys } from "./keys.ts";
export { changeSecrets, depositSecrets, noteAfterWithdrawal, nullifierHash, recoverNotes, type Note } from "./notes.ts";
export { planPieces, secureRandom, type PlanInput, type PlannedPiece } from "./planner.ts";
export { createUrlProver, formatProof, proveWithdrawal, type FormattedProof, type WithdrawalTerms } from "./proof.ts";
export { cidDigestHex, fetchApprovedSet, rootOf, type ApprovedSet } from "./asp.ts";
export { RelayerError, getQuote, sendPiece, sendSell, signOrder, signPermit, type Order, type Quote } from "./relayer.ts";
export { executePiece, randomNonce, runPlan, type BuyTarget, type PieceResult, type RoutingContext, type RoutingEvent } from "./routing.ts";
export { depositUsdg } from "./deposit.ts";
export { proveRagequit, ragequitAbi, ragequitNote, sellFromFresh, type RagequitProof } from "./exit.ts";
export { chainFor, erc20Abi, publicClientFor, walletClientFor } from "./chain.ts";
