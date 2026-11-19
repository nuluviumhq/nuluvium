// Wallets: login goes through Privy (components/app/session.tsx), which hands us an EIP-1193 provider
// for the person's wallet: an external one (Rabby, MetaMask…) or a Privy embedded wallet (email
// login). With an external wallet, one signature of a fixed message becomes the Nuluvium keys; the
// signature never leaves the browser and is not stored. Embedded wallets never sign that message
// (lib/deviceKeys.ts says why). Transactions the person sends go through the same provider.

import type { UserKeys } from "@nuluvium/sdk";
import { createWalletClient, custom, type WalletClient } from "viem";
import { browserConfig, sdk } from "./chain";
import { EXPLORER } from "./contracts";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

const CHECKED_KEY = (address: string) => `nuluvium-deterministic-v1:${address.toLowerCase()}`;

export class WalletError extends Error {}

let activeProvider: Eip1193Provider | null = null;

/** Set by the session after login (Privy's provider for the person's wallet); null on logout. */
export function setActiveProvider(next: Eip1193Provider | null) {
  activeProvider = next;
}

function provider(): Eip1193Provider {
  if (!activeProvider) throw new WalletError("Log in first.");
  return activeProvider;
}

function utf8Hex(text: string): `0x${string}` {
  return `0x${[...new TextEncoder().encode(text)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Checked once per wallet address: was the same message signed the same way twice? */
function alreadyChecked(address: string): boolean {
  try {
    return localStorage.getItem(CHECKED_KEY(address)) === "yes";
  } catch {
    return false;
  }
}
function markChecked(address: string) {
  try {
    localStorage.setItem(CHECKED_KEY(address), "yes");
  } catch {
    // Storage blocked: the check runs again next time, which is only an extra prompt.
  }
}

/**
 * Asks an external wallet for the key signature and derives the keys. On the first login with an
 * address the signature is requested twice: a wallet that signs differently each time would give
 * keys that can never be rebuilt (and funds that can never be spent), so it is refused.
 */
export async function unlockWithWallet(wallet: Eip1193Provider, address: `0x${string}`, onStep: (step: string) => void): Promise<UserKeys> {
  const { ROBINHOOD_TESTNET, keyMessage, keysFromSignature } = await sdk();
  const message = utf8Hex(keyMessage(address, ROBINHOOD_TESTNET.chainId));
  const sign = async () => (await wallet.request({ method: "personal_sign", params: [message, address] })) as `0x${string}`;

  onStep("Sign the message in your wallet. It is not a transaction.");
  const signature = await sign();
  if (!alreadyChecked(address)) {
    onStep("One more time, to check this wallet always signs the same way.");
    const again = await sign();
    if (again.toLowerCase() !== signature.toLowerCase()) {
      throw new WalletError("This wallet signs differently each time, so it cannot hold Nuluvium keys. Please use another wallet.");
    }
    markChecked(address);
  }
  return keysFromSignature(signature);
}

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/* ------------------------------------------------------------------ transactions (testnet) */


/**
 * Makes sure the wallet is on Robinhood Chain testnet. If the wallet does not know the chain, it is
 * added with this app's /api/rpc as RPC (some ISPs block the public *.robinhood.com RPC).
 */
export async function ensureTestnet(): Promise<void> {
  const wallet = provider();
  const config = await browserConfig();
  const chainId = `0x${config.chainId.toString(16)}`;
  try {
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await wallet.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: "Robinhood Chain Testnet",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [config.rpcUrl],
          blockExplorerUrls: [EXPLORER],
        },
      ],
    });
  }
}

/** What the person's wallet is asking them to do right now, for step-by-step progress text. */
export type WalletStep = "approve" | "send" | "confirming";

// ERC-20 approve(address,uint256): tells an allowance prompt apart from the deposit itself.
const APPROVE_SELECTOR = "0x095ea7b3";

/**
 * viem wallet client on the injected wallet, for transactions the person signs. With onStep, each
 * transaction prompt is reported before it opens, and "confirming" once the wallet has sent it.
 */
export async function walletClient(address: `0x${string}`, onStep?: (step: WalletStep) => void): Promise<WalletClient> {
  const { chainFor } = await sdk();
  const injected = provider();
  const transport = onStep
    ? custom({
        request: async (args: { method: string; params?: unknown }) => {
          if (args.method !== "eth_sendTransaction") return injected.request(args as never);
          const [tx] = (args.params ?? []) as [{ data?: string }];
          onStep(tx?.data?.startsWith(APPROVE_SELECTOR) ? "approve" : "send");
          const hash = await injected.request(args as never);
          onStep("confirming");
          return hash;
        },
      })
    : custom(injected);
  return createWalletClient({ account: address, chain: chainFor(await browserConfig()), transport });
}

/** Deposits tUSDG from the wallet into the shielded pool under the person's next note. */
export async function depositToPool(address: `0x${string}`, keys: UserKeys, amount: bigint, onStep?: (step: WalletStep) => void): Promise<`0x${string}`> {
  await ensureTestnet();
  const { depositUsdg, publicClientFor } = await sdk();
  const config = await browserConfig();
  const { tx } = await depositUsdg(publicClientFor(config), await walletClient(address, onStep), config, keys, amount);
  return tx;
}

// Explorer links live with the contract list (server pages use them without the SDK).
export { explorerAddress, explorerTx } from "./contracts";
