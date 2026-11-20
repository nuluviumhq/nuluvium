// The real MCP setup (docs/mcp.md): a local stdio server; the secret comes from the agent's environment.
// Shared by the landing page and /for-agents so the two never drift apart.
export const MCP_EXAMPLE = `{
  "mcpServers": {
    "nuluvium": {
      "command": "npx",
      "args": ["-y", "@nuluvium/mcp"],
      "env": {
        "NULUVIUM_MNEMONIC": "\${NULUVIUM_MNEMONIC}",
        "NULUVIUM_NETWORK": "robinhood-testnet"
      }
    }
  }
}`;

/** The six tools of the MCP server, in the order docs/mcp.md lists them. */
export const MCP_TOOLS: Array<[string, string]> = [
  ["get_balance", "Read the agent's shielded balance"],
  ["deposit", "Move USDG from the agent's wallet into its shielded balance"],
  ["route_order", "Route a buy in pieces over a time window"],
  ["cancel_order", "Stop the pieces that have not gone out yet"],
  ["get_orders", "List the agent's own orders"],
  ["get_fills", "Read the pieces that went out and their transactions"],
];
