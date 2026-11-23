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
  /** Router v2: swaps, the relayer gas fee and the protocol fee (docs/testnet.md). */
  router: Address;
  /** Routers this deployment used before `router`; read for history only, never sent to. */
  previousRouters: Address[];
  /**
   * RelayerRegistry: relayers that bonded NLV (tNLV on testnet) and may send pieces. Clients pick
   * relayers from it; unset means only `relayerUrls` are used (e.g. an agent's own relayer).
   */
  registry?: Address;
  /** Protocol fee on the USDG side of each piece, in basis points (Router v2 PROTOCOL_FEE_BPS). */
  protocolFeeBps: bigint;
  /**
   * Uniswap QuoterV2 used for minimum outputs (quoteExactInputSingle at the Router's fee tier).
   * Testnet: a stand-in that quotes the fixed-price mock swap router (docs/testnet.md).
   */
  quoter: Address;
  /**
   * Relayers used when the registry cannot be read or lists none (and the only ones when `registry`
   * is unset). Tried in random order; one that is down or refuses is skipped for a while.
   */
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
  router: "0x2A97D783811ADa610223CeBD56d77d72306F0B9e",
  previousRouters: ["0x3287C2947f137c20c8BfeB628f800D23b8e5D155"],
  registry: "0xcF69fE69E3B273f66F589c5f912f347144316bB0",
  protocolFeeBps: 10n,
  quoter: "0x42093B3DAb22760EF67849984A81084E564f728e",
  relayerUrls: ["https://relayer.nuluvium.com", "https://relayer2.nuluvium.com"],
  aspUrl: "https://asp.nuluvium.com",
};
