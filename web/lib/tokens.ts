// Tokens the app can buy on testnet. There is no official Uniswap on Robinhood Chain testnet, so the
// only token is the mock stock MSTK, swapped by a fixed-price mock router (docs/testnet.md).
// Prices come from a QuoterV2 quote (lib/chain.ts quoteOut); on testnet the quoter is a stand-in for
// the mock router, so the same code reads Uniswap on mainnet.

export interface TradableToken {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
}

export const TOKENS: TradableToken[] = [
  {
    symbol: "MSTK",
    name: "Mock stock (testnet)",
    address: "0xf2a0289ec25994dC7d22461Afd1dF3B818A0E088",
    decimals: 18,
  },
];

/** Worst price accepted per piece and per sale: 1% below a fresh quote (the relayer refuses more than 5%). */
export const SLIPPAGE_BPS = 100;
