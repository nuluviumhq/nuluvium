// Robinhood Chain testnet contracts (docs/testnet.md), shared by the Proof page and the docs.
// Plain data with no SDK import, so server-rendered pages can use it.
// The Privacy Pools v1.3.0 contracts are deployed unchanged.

export const EXPLORER = "https://explorer.testnet.chain.robinhood.com";

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`;

/** Safe 2-of-2 (SafeL2 1.4.1) that owns the Router and holds the Entrypoint OWNER_ROLE since 2026-11-21. */
export const OWNER_SAFE = "0xDe29697FB1c56422A23DCFb8b9e8689c0A0bfCB5";
/** The deployer, which held both owner roles until 2026-11-21. */
export const PREVIOUS_OWNER = "0xbdED052e3Ebf14c6631497F867CB15fDb455170b";

export interface ContractRow {
  name: string;
  address: string;
}

export const CONTRACTS: ContractRow[] = [
  { name: "Shielded pool (Privacy Pools v1.3.0)", address: "0x2B38bF53acc21a51603E68f5BC3bC8943B01fD4a" },
  { name: "Entrypoint (Privacy Pools)", address: "0x1C7Bd821a61A90BA06e21aac4e03640E3D065536" },
  { name: "Router (Nuluvium)", address: "0x3287C2947f137c20c8BfeB628f800D23b8e5D155" },
  { name: "Withdrawal proof verifier", address: "0x452ec534a1C765450f1E805fE1B8854Ca5aad8E8" },
  { name: "Test USDG (mock)", address: "0xd26d58F86cf82c702b558D6E7F159939E97F0Bfa" },
  { name: "MSTK (mock stock)", address: "0xf2a0289ec25994dC7d22461Afd1dF3B818A0E088" },
  { name: "Owner (Safe 2-of-2)", address: OWNER_SAFE },
  { name: "Approved-set postman (key)", address: "0xD40CA7EE663FddFc02d170E5e81bAe6D3a5B3E32" },
  { name: "Relayer (key)", address: "0x7a7A1f77C957B7C926AA9baF6cE8fA334270c72F" },
];
