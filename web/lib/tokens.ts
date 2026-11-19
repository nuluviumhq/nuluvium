// Tokens the app can buy on testnet. There is no official Uniswap on Robinhood Chain testnet, so the
// only token is the mock stock MSTK, swapped by a fixed-price mock router (docs/testnet.md).
// Real stock tokens and Uniswap quotes come with mainnet.

export interface TradableToken {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  /** Fixed mock price, tUSDG units per whole token. */
  mockPrice: bigint;
}

export const TOKENS: TradableToken[] = [
  {
    symbol: "MSTK",
    name: "Mock stock (testnet)",
    address: "0xf2a0289ec25994dC7d22461Afd1dF3B818A0E088",
    decimals: 18,
    mockPrice: 180_000_000n,
  },
];

/** Tokens out for `usdgIn` tUSDG units at the token's mock price. */
export const expectedOut = (token: TradableToken, usdgIn: bigint) => (usdgIn * 10n ** BigInt(token.decimals)) / token.mockPrice;
