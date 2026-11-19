// Testnet faucet (faucet/ Worker at faucet.nuluvium.com): one request gives the wallet a little
// test ETH for its own gas (only when it has almost none) and 100 test USDG, at most once a day.
// The person signs nothing and needs no gas for it.

export const FAUCET_URL = "https://faucet.nuluvium.com";

export interface FaucetDrip {
  /** ETH sent, as a decimal string ("0" when the wallet already had enough for gas). */
  eth: string;
  usdg: string;
  ethTx?: `0x${string}`;
  usdgTx: `0x${string}`;
}

/** Asks the faucet for test funds; throws an Error with the faucet's own message when it refuses. */
export async function requestTestFunds(address: string): Promise<FaucetDrip> {
  let response: Response;
  try {
    response = await fetch(`${FAUCET_URL}/drip`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
  } catch {
    throw new Error("The faucet could not be reached. Try again in a minute.");
  }
  const body = (await response.json().catch(() => ({}))) as Partial<FaucetDrip> & { error?: string };
  if (!response.ok || !body.usdgTx) throw new Error(body.error ?? "The faucet could not send right now. Try again in a minute.");
  return body as FaucetDrip;
}
