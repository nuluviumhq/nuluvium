// Faucet rules, kept apart from the Worker so they run under node --test.
//
// One request gives a wallet what it needs to try Nuluvium on testnet: a little ETH for its own
// gas (approve + deposit cost about 0.000004 ETH together) and 100 test USDG. Limits keep it from
// being drained: one drip per wallet per day, a few per visitor per day, a daily total, and a
// reserve the faucet never goes below.

import { getAddress } from "viem";

export class Refusal extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const DRIP_ETH = 20_000_000_000_000n; // 0.00002 ETH: about five deposits' worth of gas
export const DRIP_USDG = 100_000_000n; // 100 test USDG (6 decimals)
export const RESERVE_ETH = 50_000_000_000_000n; // the faucet keeps this for its own transactions
export const PER_VISITOR_PER_DAY = 3;
export const PER_DAY_TOTAL = 300;
export const DAY_SECONDS = 24 * 60 * 60;

/** The wallet to fund, checksummed; refuses anything that is not an address. */
export function walletFrom(body) {
  try {
    return getAddress(String(body?.address ?? ""));
  } catch {
    throw new Refusal("address must be a wallet address (0x…)");
  }
}

/**
 * What to send: ETH only when the wallet holds less than half a drip (so a funded wallet does not
 * take more), USDG always. Null amounts mean "nothing to send".
 */
export function plan({ walletEth, faucetEth }) {
  const eth = walletEth < DRIP_ETH / 2n ? DRIP_ETH : 0n;
  if (eth > 0n && faucetEth < eth + RESERVE_ETH) {
    throw new Refusal("The faucet is out of test ETH right now. Use the official faucet: https://faucet.testnet.chain.robinhood.com", 503);
  }
  return { eth, usdg: DRIP_USDG };
}

/** Refuses when a daily limit is reached. Counts are read before this request is added. */
export function checkLimits({ walletUsedToday, visitorCountToday, totalToday }) {
  if (walletUsedToday) throw new Refusal("This wallet already got test funds today. Try again tomorrow.", 429);
  if (visitorCountToday >= PER_VISITOR_PER_DAY) throw new Refusal("Daily limit reached for your connection. Try again tomorrow.", 429);
  if (totalToday >= PER_DAY_TOTAL) throw new Refusal("The faucet reached today's limit. Try again tomorrow or use the official faucet.", 429);
}

/** UTC day, for the daily counters. */
export const dayOf = (unixSeconds) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);
