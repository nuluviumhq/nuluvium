// Local test wallet for browser checks (session 1.8c). Answers EIP-1193 requests forwarded by a
// small shim in the page: signs with the PUBLIC BIP-39 test mnemonic ("test test … junk",
// account 0), sends transactions through TESTNET_RPC_URL, forwards reads. Testnet only; the key is
// public on purpose. Listens on 127.0.0.1 only.
// Usage (from testnet/): node test-wallet-server.mjs   → http://127.0.0.1:8547

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createWalletClient, defineChain, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";

const PORT = 8547;
const account = mnemonicToAccount("test test test test test test test test test test test junk");
const rpcUrl = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").match(/^TESTNET_RPC_URL=(.*)$/m)?.[1]?.trim();
if (!rpcUrl) throw new Error("TESTNET_RPC_URL missing in .dev.vars");
const chain = defineChain({ id: 46_630, name: "Robinhood Chain Testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

async function forward(method, params) {
  const response = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = await response.json();
  if (body.error) throw Object.assign(new Error(body.error.message), { code: body.error.code });
  return body.result;
}

async function handle(method, params = []) {
  switch (method) {
    case "eth_requestAccounts":
    case "eth_accounts":
      return [account.address];
    case "eth_chainId":
      return "0xb626";
    case "wallet_switchEthereumChain":
    case "wallet_addEthereumChain":
      return null;
    case "personal_sign":
      return account.signMessage({ message: { raw: params[0] } });
    case "eth_sendTransaction": {
      const [tx] = params;
      const hash = await wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : undefined,
        gas: tx.gas ? BigInt(tx.gas) : undefined,
      });
      console.log(`sent ${hash}`);
      return hash;
    }
    default:
      return forward(method, params);
  }
}

createServer(async (request, response) => {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-headers", "content-type");
  if (request.method === "OPTIONS") return response.end();
  let body = "";
  for await (const chunk of request) body += chunk;
  try {
    const { method, params } = JSON.parse(body);
    const result = await handle(method, params);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ result }));
  } catch (error) {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ error: { code: error.code ?? -32000, message: error.shortMessage ?? error.message } }));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Test wallet ${account.address} on http://127.0.0.1:${PORT}`));
