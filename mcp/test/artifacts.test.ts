import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ARTIFACT_FILES, ensureArtifacts, missingArtifacts } from "../src/artifacts.ts";

/** A local server that serves each artifact name as its own content, and counts requests. */
async function serve(failing: string[] = []) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const name = (request.url ?? "").split("/").pop() ?? "";
    requests.push(name);
    if (failing.includes(name)) return void response.writeHead(404).end();
    response.writeHead(200).end(`content of ${name}`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/artifacts`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

test("downloads only the missing files, once", async () => {
  const folder = mkdtempSync(join(tmpdir(), "nuluvium-artifacts-"));
  writeFileSync(join(folder, "commitment.vkey"), "already here");
  const host = await serve();
  try {
    await ensureArtifacts(folder, host.url);
    assert.deepEqual(missingArtifacts(folder), []);
    assert.equal(host.requests.length, ARTIFACT_FILES.length - 1);
    assert.equal(readFileSync(join(folder, "withdraw.zkey"), "utf8"), "content of withdraw.zkey");
    assert.equal(readFileSync(join(folder, "commitment.vkey"), "utf8"), "already here");
    await ensureArtifacts(folder, host.url);
    assert.equal(host.requests.length, ARTIFACT_FILES.length - 1); // nothing fetched the second time
  } finally {
    await host.close();
  }
});

test("a failed download leaves no partial file and reports the file", async () => {
  const folder = mkdtempSync(join(tmpdir(), "nuluvium-artifacts-"));
  const host = await serve(["withdraw.zkey"]);
  try {
    await assert.rejects(ensureArtifacts(folder, host.url), /withdraw\.zkey \(HTTP 404\)/);
    assert.ok(!existsSync(join(folder, "withdraw.zkey")));
    assert.ok(!existsSync(join(folder, "withdraw.zkey.partial")));
    assert.ok(missingArtifacts(folder).includes("withdraw.zkey"));
  } finally {
    await host.close();
  }
});
