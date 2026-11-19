// Runs every check in the repository and prints one summary: lint, then each package's typecheck
// and tests, the contract tests, and (with --build) the web production build.
// Packages must be installed first (`npm ci` in each, see README). CI runs the same steps.
//
// Usage: npm run check            (from the repository root)
//        npm run check -- --build (also `next build` for the web app)

import { spawnSync } from "node:child_process";

const steps = [
  ["lint (biome)", ".", "npx biome lint ."],
  ["contracts: forge test", "contracts", "forge test"],
  ["sdk: typecheck", "sdk", "npm run typecheck"],
  ["sdk: tests", "sdk", "npm test"],
  ["mcp: typecheck", "mcp", "npm run typecheck"],
  ["mcp: tests", "mcp", "npm test"],
  ["relayer: tests", "relayer", "npm test"],
  ["asp: tests", "asp", "npm test"],
  ["stats: tests", "stats", "npm test"],
  ["web: typecheck", "web", "npm run typecheck"],
  ["web: tests", "web", "npm test"],
];
if (process.argv.includes("--build")) steps.push(["web: next build", "web", "npx next build"]);

const results = [];
for (const [name, cwd, command] of steps) {
  const started = Date.now();
  const run = spawnSync(command, { cwd, shell: true, encoding: "utf8" });
  const ok = run.status === 0;
  results.push({ name, ok, seconds: ((Date.now() - started) / 1000).toFixed(1) });
  console.log(`${ok ? "pass" : "FAIL"}  ${name} (${results.at(-1).seconds} s)`);
  if (!ok) console.log((run.stdout + run.stderr).split("\n").slice(-25).join("\n"));
}

const failed = results.filter((result) => !result.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
