// Robinhood Chain testnet contracts (docs/testnet.md), shared by the Proof page and the docs.
// Plain data with no SDK import, so server-rendered pages can use it.
// The Privacy Pools v1.3.0 contracts are deployed unchanged.

export const EXPLORER = "https://explorer.testnet.chain.robinhood.com";

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`;

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
  { name: "Approved-set postman (key)", address: "0xD40CA7EE663FddFc02d170E5e81bAe6D3a5B3E32" },
  { name: "Relayer (key)", address: "0x7a7A1f77C957B7C926AA9baF6cE8fA334270c72F" },
];
