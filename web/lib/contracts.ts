// Robinhood Chain testnet contracts (docs/testnet.md), shared by the Proof page and the docs.
// Plain data with no SDK import, so server-rendered pages can use it.
// The Privacy Pools v1.3.0 contracts are deployed unchanged.

export const EXPLORER = "https://explorer.testnet.chain.robinhood.com";

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`;

/**
 * Safe 2-of-2 (SafeL2 1.4.1) that owns Router v1 and holds the Entrypoint OWNER_ROLE since 2026-11-21.
 * It is the pending owner of Router v2 and the RelayerRegistry until both signers accept, and the
 * treasury that receives half of the Router v2 protocol fee.
 */
export const OWNER_SAFE = "0xDe29697FB1c56422A23DCFb8b9e8689c0A0bfCB5";
/** The deployer, which held both owner roles until 2026-11-21. */
export const PREVIOUS_OWNER = "0xbdED052e3Ebf14c6631497F867CB15fDb455170b";

/** Router v2 (deployed 2026-11-23): swaps, the relayer gas fee and the 0.1% protocol fee. */
export const ROUTER_V2 = "0x2A97D783811ADa610223CeBD56d77d72306F0B9e";
/** RelayerRegistry: relayers bond tNLV here; Router v2 only takes pieces from active ones. */
export const RELAYER_REGISTRY = "0xcF69fE69E3B273f66F589c5f912f347144316bB0";
/** TestNLV (tNLV): faucet-only test token for relayer bonds. Traders never need it. */
export const TEST_NLV = "0xfcff1d517C41b122Fa5Ec711e569726B8E869660";

export interface ContractRow {
  name: string;
  address: string;
}

export const CONTRACTS: ContractRow[] = [
  { name: "Shielded pool (Privacy Pools v1.3.0)", address: "0x2B38bF53acc21a51603E68f5BC3bC8943B01fD4a" },
  { name: "Entrypoint (Privacy Pools)", address: "0x1C7Bd821a61A90BA06e21aac4e03640E3D065536" },
  { name: "Router v2 (Nuluvium, protocol fee)", address: ROUTER_V2 },
  { name: "Relayer registry (bonds)", address: RELAYER_REGISTRY },
  { name: "tNLV (test token, no value)", address: TEST_NLV },
  { name: "Router v1 (before 23 Nov 2026)", address: "0x3287C2947f137c20c8BfeB628f800D23b8e5D155" },
  { name: "Withdrawal proof verifier", address: "0x452ec534a1C765450f1E805fE1B8854Ca5aad8E8" },
  { name: "Test USDG (mock)", address: "0xd26d58F86cf82c702b558D6E7F159939E97F0Bfa" },
  { name: "MSTK (mock stock)", address: "0xf2a0289ec25994dC7d22461Afd1dF3B818A0E088" },
  { name: "Owner (Safe 2-of-2)", address: OWNER_SAFE },
  { name: "Approved-set postman (key)", address: "0xD40CA7EE663FddFc02d170E5e81bAe6D3a5B3E32" },
  { name: "Relayer 1 (key)", address: "0x7a7A1f77C957B7C926AA9baF6cE8fA334270c72F" },
  { name: "Relayer 2 (key)", address: "0x21Ad9f184908b119694Bb0E3365eCa4Acc4155c0" },
];
