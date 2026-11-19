// Networks and tradable tokens. Only allowlisted tokens can be routed.

import type { Address } from "viem";
import { ROBINHOOD_TESTNET, type NetworkConfig } from "../../sdk/src/index.ts";

export interface TradableToken {
  symbol: string;
  address: Address;
  decimals: number;
  /**
   * Smallest acceptable output for `usdgIn` (after the relayer fee), before slippage.
   * Testnet: the fixed mock price. Mainnet: a Uniswap quote (not wired yet).
   */
  expectedOut: (usdgIn: bigint) => bigint;
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

const MOCK_USDG_PER_STOCK = 180_000_000n; // contracts/deployments/46630-router.json

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
        expectedOut: (usdgIn) => (usdgIn * 10n ** 18n) / MOCK_USDG_PER_STOCK,
        note: "Testnet mock stock at a fixed price of 180 tUSDG (no official Uniswap on testnet).",
      },
    },
  },
};
