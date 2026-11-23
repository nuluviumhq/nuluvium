# @nuluvium/ai-sdk

Nuluvium tools for the [Vercel AI SDK](https://ai-sdk.dev). Your agent buys Robinhood Chain stock tokens
in small pieces, each from a fresh address paid from a shielded USDG balance, so the trades do not trace
back to the agent's wallet.

The package starts the [Nuluvium MCP server](https://www.npmjs.com/package/@nuluvium/mcp) on your machine
over stdio and returns its tools for `generateText` or `streamText`. The agent's secret stays on that
machine: it goes only to the local server process, which makes the keys, the proofs and the order
schedule there.

**Robinhood Chain testnet only, with test tokens. Not audited.**

## Install

Node.js 22.18 or newer.

```sh
npm install @nuluvium/ai-sdk ai
npx -y @nuluvium/mcp --prepare   # once: downloads the circuit files for proofs (about 23 MB)
```

## Use

```ts
import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createNuluviumTools } from "@nuluvium/ai-sdk";

const nuluvium = await createNuluviumTools(); // reads NULUVIUM_MNEMONIC
try {
  const { text } = await generateText({
    model: anthropic("claude-sonnet-5-5"),
    tools: nuluvium.tools,
    stopWhen: stepCountIs(5),
    prompt: "Show my shielded balance, then buy 10 USDG of MSTK in 3 pieces over 10 minutes.",
  });
  console.log(text);
} finally {
  await nuluvium.close();
}
```

Pieces go out in the background while the MCP server runs, so keep the process alive (or call the tools
again later) until the order window has passed.

## Environment

| Variable | |
|---|---|
| `NULUVIUM_MNEMONIC` | Required. The agent's own BIP-39 secret (twelve words). Use a new testnet one, never a real wallet's. |
| `NULUVIUM_NETWORK` | Default `robinhood-testnet`. |
| `NULUVIUM_RPC_URL` | Optional own RPC, where your network blocks robinhood.com. |

`createNuluviumTools({ mnemonic, network, rpcUrl, relayers, home })` takes the same settings as options.

## Tools

`get_balance`, `deposit`, `route_order`, `cancel_order`, `get_orders`, `get_fills`. Inputs and outputs:
[nuluvium.com/docs/agents](https://nuluvium.com/docs/agents).

## Limits

- Testnet only; test USDG and a mock stock token (MSTK). Nothing here has real value.
- The contracts and services are not audited.
- A deposit is public. What the agent buys with it afterwards is not linked to it.
- Privacy is from other readers of the chain, not from Robinhood.

Docs: [nuluvium.com/docs/agents/ai-sdk](https://nuluvium.com/docs/agents/ai-sdk) · Source:
[github.com/nuluviumhq/nuluvium](https://github.com/nuluviumhq/nuluvium/tree/main/ai-sdk) · License: Apache-2.0
