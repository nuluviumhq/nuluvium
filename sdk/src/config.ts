import type { Address } from "viem";

/** Where Nuluvium lives on one network. Public values only; secrets are passed separately. */
export interface NetworkConfig {
  chainId: number;
  rpcUrl: string;
  /** Largest block range the RPC accepts for eth_getLogs (public testnet RPC: 10,000,000; Alchemy: 10,000). */
  logChunk: bigint;
  entrypoint: Address;
  pool: Address;
  usdg: Address;
  /** Pool scope (Privacy Pools domain separator for this pool). */
  scope: bigint;
  /** L2 block of the pool deployment; log scans start here. */
  deployBlock: bigint;
  router: Address;
  /**
   * Uniswap QuoterV2 used for minimum outputs (quoteExactInputSingle at the Router's fee tier).
   * Testnet: a stand-in that quotes the fixed-price mock swap router (docs/testnet.md).
   */
  quoter: Address;
  /** Relayers, tried in random order; a relayer that is down or refuses is skipped for a while. */
  relayerUrls: string[];
  aspUrl: string;
}

/** Robinhood Chain testnet deployment (docs/testnet.md). */
export const ROBINHOOD_TESTNET: NetworkConfig = {
  chainId: 46_630,
  rpcUrl: "https://rpc.testnet.chain.robinhood.com",
  logChunk: 5_000_000n,
  entrypoint: "0x1C7Bd821a61A90BA06e21aac4e03640E3D065536",
  pool: "0x2B38bF53acc21a51603E68f5BC3bC8943B01fD4a",
  usdg: "0xd26d58F86cf82c702b558D6E7F159939E97F0Bfa",
  scope: 20883339666151915200592145183006062909365231028523521475069391119255857699183n,
  deployBlock: 153_603_397n,
  router: "0x3287C2947f137c20c8BfeB628f800D23b8e5D155",
  quoter: "0x42093B3DAb22760EF67849984A81084E564f728e",
  relayerUrls: ["https://relayer.nuluvium.com", "https://relayer2.nuluvium.com"],
  aspUrl: "https://asp.nuluvium.com",
};
