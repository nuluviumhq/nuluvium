// Runs the real Nuluvium MCP server from this repository (../mcp/src/server.ts, no npx, no network)
// and drives it with the AI SDK's mock model: the tools load, and a get_orders call round-trips.
// get_orders only reads the local schedule, so the test needs no RPC and costs nothing.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { generateText, stepCountIs } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createNuluviumTools } from "../src/index.ts";

// The public BIP-39 test mnemonic (never holds anything).
const TEST_MNEMONIC = "test test test test test test test test test test test junk";
const server = fileURLToPath(new URL("../../mcp/src/server.ts", import.meta.url));
const home = mkdtempSync(join(tmpdir(), "nuluvium-ai-sdk-"));
after(() => rmSync(home, { recursive: true, force: true }));

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

test("refuses to start without a mnemonic", async () => {
  const saved = process.env.NULUVIUM_MNEMONIC;
  delete process.env.NULUVIUM_MNEMONIC;
  try {
    await assert.rejects(createNuluviumTools({ command: process.execPath, args: [server] }), /NULUVIUM_MNEMONIC/);
  } finally {
    if (saved !== undefined) process.env.NULUVIUM_MNEMONIC = saved;
  }
});

test("loads the tools and a mock model calls get_orders", async () => {
  const nuluvium = await createNuluviumTools({ mnemonic: TEST_MNEMONIC, home, command: process.execPath, args: [server] });
  try {
    for (const name of ["get_balance", "deposit", "route_order", "cancel_order", "get_orders", "get_fills"]) {
      assert.ok(name in nuluvium.tools, `missing tool ${name}`);
    }
    let call = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        call += 1;
        if (call === 1) {
          return {
            content: [{ type: "tool-call", toolCallId: "call-1", toolName: "get_orders", input: "{}" }],
            finishReason: { unified: "tool-calls", raw: undefined },
            usage,
            warnings: [],
          };
        }
        return { content: [{ type: "text", text: "You have no orders." }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
      },
    });
    const result = await generateText({ model, tools: nuluvium.tools, stopWhen: stepCountIs(3), prompt: "List my orders." });
    const toolResults = result.steps.flatMap((step) => step.toolResults);
    assert.equal(toolResults.length, 1);
    assert.equal(toolResults[0]?.toolName, "get_orders");
    assert.equal(result.text, "You have no orders.");
  } finally {
    await nuluvium.close();
  }
});
