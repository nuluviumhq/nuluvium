// Ways out of Nuluvium, in the browser.
//   holdings   every fresh address the person's pieces went to, rebuilt from the chain and their
//              keys (not from this browser's order list), with what each one holds now
//   sell       a fresh address sells its stock tokens for tUSDG, gasless, through the relayer
//   export     the private key of one fresh address, to import it into a wallet
//   ragequit   the depositing wallet takes a deposit's tUSDG back from the pool (public)

import type { UserKeys } from "@nuluvium/sdk";
import { parseAbi, toHex } from "viem";
import { browserConfig, sdk } from "./chain";
import { TOKENS, type TradableToken } from "./tokens";
import { ensureTestnet, walletClient } from "./wallet";

/** Multicall3 at its usual address (present on Robinhood Chain testnet, docs/testnet.md). */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const balanceAbi = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);
const SELL_SLIPPAGE_BPS = 100n; // 1%, as for buys

export interface Holding {
  depositIndex: bigint;
  /** Piece number within the deposit: the k-th private withdrawal went to this address. */
  piece: number;
  address: `0x${string}`;
  /** Stock token balances by symbol, in token units. */
  tokens: Record<string, bigint>;
  usdg: bigint;
}

/**
 * Every fresh address made from these keys that holds something. Deposit i's k-th withdrawal went
 * to freshAccount(keys, i, k), so the list comes from the notes alone.
 */
export async function readHoldings(keys: UserKeys): Promise<{ holdings: Holding[]; empty: number }> {
  const { freshAccount, publicClientFor, recoverNotes } = await sdk();
  const config = await browserConfig();
  const client = publicClientFor(config);
  const { spendable, spent } = await recoverNotes(client, config, keys);

  const places = [...spendable, ...spent].flatMap((note) =>
    Array.from({ length: note.withdrawals }, (_, piece) => ({ depositIndex: note.depositIndex, piece, address: freshAccount(keys, note.depositIndex, piece).address })),
  );
  if (places.length === 0) return { holdings: [], empty: 0 };

  // One multicall: every token plus tUSDG for every address.
  const assets = [...TOKENS.map((token) => token.address), config.usdg];
  const results = await client.multicall({
    multicallAddress: MULTICALL3,
    allowFailure: false,
    contracts: places.flatMap((place) => assets.map((asset) => ({ address: asset, abi: balanceAbi, functionName: "balanceOf" as const, args: [place.address] as const }))),
  });

  const holdings: Holding[] = places.map((place, index) => {
    const row = results.slice(index * assets.length, (index + 1) * assets.length) as bigint[];
    return {
      ...place,
      tokens: Object.fromEntries(TOKENS.map((token, column) => [token.symbol, row[column]!])),
      usdg: row[assets.length - 1]!,
    };
  });
  const held = holdings.filter((holding) => holding.usdg > 0n || Object.values(holding.tokens).some((amount) => amount > 0n));
  return { holdings: held, empty: holdings.length - held.length };
}

/** tUSDG units a sale of `amount` brings at the mock price, before the relayer fee. */
export const saleValue = (token: TradableToken, amount: bigint) => (amount * token.mockPrice) / 10n ** BigInt(token.decimals);

/**
 * Sells everything `holding` holds of `token` for tUSDG, which stays on the same fresh address.
 * The relayer pays the gas and takes its fee from the tUSDG.
 */
export async function sellHolding(keys: UserKeys, holding: Holding, token: TradableToken): Promise<{ tx: `0x${string}`; fee: bigint }> {
  const { freshAccount, getQuote, publicClientFor, sellFromFresh } = await sdk();
  const config = await browserConfig();
  const client = publicClientFor(config);
  const fresh = freshAccount(keys, holding.depositIndex, holding.piece);
  const amount = await client.readContract({ address: token.address, abi: balanceAbi, functionName: "balanceOf", args: [fresh.address] });
  if (amount === 0n) throw new Error("This address holds none of that token any more.");

  const { fee } = await getQuote(config);
  const value = saleValue(token, amount);
  // The Router accepts the order up to twice the quoted fee, so the minimum leaves room for that.
  const minimum = (value * (10_000n - SELL_SLIPPAGE_BPS)) / 10_000n - fee * 2n;
  if (minimum <= 0n) throw new Error("This holding is worth less than the relayer fee, so it cannot be sold through the relayer.");
  return sellFromFresh(client, config, fresh, token.address, amount, minimum);
}

/** Private key of one fresh address, as 0x hex, for importing into a wallet. */
export async function freshPrivateKey(keys: UserKeys, holding: Holding): Promise<`0x${string}`> {
  const { freshAccount } = await sdk();
  const key = freshAccount(keys, holding.depositIndex, holding.piece).getHdKey().privateKey;
  if (!key) throw new Error("No key for this address.");
  return toHex(key);
}

/**
 * Takes a deposit's whole remaining balance back to the wallet that made it. Public: the
 * transaction shows the wallet getting that deposit back. The wallet sends it and pays the gas.
 */
export async function ragequitDeposit(address: `0x${string}`, keys: UserKeys, depositIndex: bigint): Promise<{ tx: `0x${string}`; value: bigint }> {
  await ensureTestnet();
  const { createUrlProver, publicClientFor, ragequitNote, recoverNotes } = await sdk();
  const config = await browserConfig();
  const client = publicClientFor(config);
  const note = (await recoverNotes(client, config, keys)).spendable.find((item) => item.depositIndex === depositIndex);
  if (!note) throw new Error("This deposit has nothing left to take back.");
  return ragequitNote(client, await walletClient(address), config, createUrlProver(`${window.location.origin}/`), note);
}
