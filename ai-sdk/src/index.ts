// Nuluvium tools for the Vercel AI SDK. Starts the Nuluvium MCP server (@nuluvium/mcp) on this machine
// over stdio and hands its tools to generateText / streamText. The agent's secret (NULUVIUM_MNEMONIC)
// goes only to that local process; nothing here sends it anywhere else.
//
// Tools: get_balance, deposit, route_order, cancel_order, get_orders, get_fills (see the MCP docs:
// https://github.com/nuluviumhq/nuluvium/blob/main/docs/mcp.md). Robinhood Chain testnet only.

import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";

export interface NuluviumToolsOptions {
  /** The agent's BIP-39 secret. Default: process.env.NULUVIUM_MNEMONIC. */
  mnemonic?: string;
  /** Network name. Default: process.env.NULUVIUM_NETWORK, else "robinhood-testnet". */
  network?: string;
  /** Own RPC URL (may hold an API key; passed to the local server only). */
  rpcUrl?: string;
  /** Relayer URLs instead of the network's own list. */
  relayers?: string[];
  /** Folder for the order schedule. Default: ~/.nuluvium (set by the server). */
  home?: string;
  /** Command that starts the MCP server. Default: npx -y @nuluvium/mcp@0.1 */
  command?: string;
  args?: string[];
}

export interface NuluviumTools {
  /** Pass to generateText({ tools }) or streamText({ tools }). */
  tools: Awaited<ReturnType<MCPClient["tools"]>>;
  /** Stops the local MCP server. Call it when the agent is done. */
  close: () => Promise<void>;
}

/** The server process gets this process's environment plus the Nuluvium settings. */
function serverEnv(options: NuluviumToolsOptions, mnemonic: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  env.NULUVIUM_MNEMONIC = mnemonic;
  if (options.network) env.NULUVIUM_NETWORK = options.network;
  if (options.rpcUrl) env.NULUVIUM_RPC_URL = options.rpcUrl;
  if (options.relayers?.length) env.NULUVIUM_RELAYERS = options.relayers.join(",");
  if (options.home) env.NULUVIUM_HOME = options.home;
  return env;
}

/**
 * Starts the Nuluvium MCP server locally and returns its tools for the AI SDK.
 *
 * @example
 * const nuluvium = await createNuluviumTools();
 * try {
 *   const { text } = await generateText({ model, tools: nuluvium.tools, stopWhen: stepCountIs(5), prompt: "What is my shielded balance?" });
 * } finally {
 *   await nuluvium.close();
 * }
 */
export async function createNuluviumTools(options: NuluviumToolsOptions = {}): Promise<NuluviumTools> {
  const mnemonic = options.mnemonic ?? process.env.NULUVIUM_MNEMONIC;
  if (!mnemonic) throw new Error("Set NULUVIUM_MNEMONIC (the agent's BIP-39 secret) or pass { mnemonic }.");
  const command = options.command ?? "npx";
  const args = options.args ?? ["-y", "@nuluvium/mcp@0.1"];
  const client = await createMCPClient({
    transport: new StdioMCPTransport({
      command,
      args,
      env: serverEnv(options, mnemonic),
      // npx is a .cmd script on Windows, which needs a shell to start.
      shell: process.platform === "win32" && command === "npx",
    }),
  });
  try {
    const tools = await client.tools();
    return { tools, close: () => client.close() };
  } catch (error) {
    await client.close();
    throw error;
  }
}
