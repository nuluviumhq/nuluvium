// Networks and tradable tokens. Only allowlisted tokens can be routed. Minimum outputs come from a
// QuoterV2 quote at the Router's fee tier for every piece (SDK quotedBuy); on testnet the quoter is
// a stand-in for the fixed-price mock router.

import type { Address } from "viem";
import { ROBINHOOD_TESTNET, type NetworkConfig } from "../../sdk/src/index.ts";

export interface TradableToken {
  symbol: string;
  address: Address;
  decimals: number;
  note?: string;
}

export interface Network {
  name: string;
  config: NetworkConfig;
  explorer: string;
  /** Where to get gas on a testnet (shown when the deposit wallet has no ETH). */
  faucet?: string;
  /** Where the circuit files are served (downloaded once when not on this machine). */
  artifactsUrl: string;
  tokens: Record<string, TradableToken>;
}

export const NETWORKS: Record<string, Network> = {
  "robinhood-testnet": {
    name: "Robinhood Chain testnet",
    config: ROBINHOOD_TESTNET,
    explorer: "https://explorer.testnet.chain.robinhood.com",
    faucet: "https://faucet.testnet.chain.robinhood.com",
    artifactsUrl: "https://nuluvium.com/artifacts",
    tokens: {
      MSTK: {
        symbol: "MSTK",
        address: "0xf2a0289ec25994dC7d22461Afd1dF3B818A0E088",
        decimals: 18,
        note: "Testnet mock stock at a fixed price of 180 tUSDG (no official Uniswap on testnet).",
      },
    },
  },
};
