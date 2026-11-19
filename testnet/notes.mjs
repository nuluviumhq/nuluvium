// Deposit, approved-set lookup, private withdrawal and ragequit against the testnet USDG pool.
// Used by flow.mjs (one deposit and withdrawal) and asp-demo.mjs (approved vs rejected deposits).
// Note secrets are derived from TESTNET_NOTE_MNEMONIC and never written anywhere.

import { createHash } from "node:crypto";
import { encodeAbiParameters, formatUnits, parseAbi, parseEventLogs } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import {
  ContractInteractionsService,
  PrivacyPoolSDK,
  calculateContext,
  generateDepositSecrets,
  generateMasterKeys,
  generateMerkleProof,
  generateWithdrawalSecrets,
  getCommitment,
  hashPrecommitment,
} from "@0xbow/privacy-pools-core-sdk";
import { LocalCircuits, RPC_URL, clients, leanTreeDepth, loadDeployment, loadDevVars, robinhoodTestnet, txLink } from "./lib.mjs";

export const ASP_URL = process.env.ASP_URL ?? "https://asp.nuluvium.com";
export const USDG_DECIMALS = 6;
export const RELAY_FEE_BPS = 50n; // 0.5%, below the pool's 1% maximum
// Fresh addresses come from the note mnemonic at a separate index range, so they can be recovered.
const FRESH_ADDRESS_INDEX_BASE = 1000;

export const toUnits = (usdg) => BigInt(Math.round(Number(usdg) * 10 ** USDG_DECIMALS));
export const show = (units) => `${formatUnits(units, USDG_DECIMALS)} tUSDG`;

const usdgAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);
const entrypointAbi = parseAbi([
  "function deposit(address asset, uint256 value, uint256 precommitment) returns (uint256)",
  "function latestRoot() view returns (uint256)",
]);
const poolAbi = parseAbi([
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
  "event LeafInserted(uint256 _index, uint256 _leaf, uint256 _root)",
  "event Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value)",
  "function currentRoot() view returns (uint256)",
]);

/** Everything the steps need: secrets, deployment, clients per key, the proving SDK. */
export function context() {
  const vars = loadDevVars();
  const deployment = loadDeployment();
  const deployer = clients(vars.TESTNET_DEPLOYER_KEY);
  return {
    vars,
    deployment,
    publicClient: deployer.publicClient,
    keys: generateMasterKeys(vars.TESTNET_NOTE_MNEMONIC),
    sdk: new PrivacyPoolSDK(new LocalCircuits()),
    // Every address that deposits with these note keys (deposit indexes are shared between them).
    ownAddresses: ["TESTNET_DEPLOYER_KEY", "TESTNET_DENYLISTED_KEY"]
      .filter((name) => vars[name])
      .map((name) => clients(vars[name]).account.address.toLowerCase()),
  };
}

async function send(ctx, walletClient, label, request) {
  const hash = await walletClient.writeContract(request);
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${txLink(hash)}`);
  console.log(`  ${label}: ${txLink(hash)}`);
  return receipt;
}

const poolLogs = (ctx, eventName) =>
  ctx.publicClient.getContractEvents({
    address: ctx.deployment.pool,
    abi: poolAbi,
    eventName,
    fromBlock: ctx.deployment.deploymentBlock,
  });

/** Mints test USDG to the signer and deposits it. Returns the note needed to spend it later. */
export async function deposit(ctx, signerKey, amount) {
  const { account, walletClient } = clients(signerKey);
  const used = (await poolLogs(ctx, "Deposited")).filter((log) =>
    ctx.ownAddresses.includes(log.args._depositor.toLowerCase()),
  ).length;
  const index = BigInt(used);
  const secrets = generateDepositSecrets(ctx.keys, ctx.deployment.scope, index);
  const precommitment = hashPrecommitment(secrets.nullifier, secrets.secret);
  const { usdg, entrypoint } = ctx.deployment;

  await send(ctx, walletClient, "mint", { address: usdg, abi: usdgAbi, functionName: "mint", args: [account.address, amount] });
  await send(ctx, walletClient, "approve", { address: usdg, abi: usdgAbi, functionName: "approve", args: [entrypoint, amount] });
  const receipt = await send(ctx, walletClient, "deposit", {
    address: entrypoint,
    abi: entrypointAbi,
    functionName: "deposit",
    args: [usdg, amount, precommitment],
  });
  const [event] = parseEventLogs({ abi: poolAbi, eventName: "Deposited", logs: receipt.logs });
  return {
    index,
    secrets,
    depositor: account.address,
    signerKey,
    label: event.args._label,
    value: event.args._value,
    commitmentHash: event.args._commitment,
    tx: receipt.transactionHash,
  };
}

/**
 * Rebuilds the notes of deposits already made with these note keys, oldest first. Secrets are
 * derived again from the mnemonic, so an interrupted run can continue without stored secrets.
 */
export async function ownNotes(ctx) {
  const signerKeyFor = Object.fromEntries(
    ["TESTNET_DEPLOYER_KEY", "TESTNET_DENYLISTED_KEY"]
      .filter((name) => ctx.vars[name])
      .map((name) => [clients(ctx.vars[name]).account.address.toLowerCase(), ctx.vars[name]]),
  );
  return (await poolLogs(ctx, "Deposited"))
    .filter((log) => ctx.ownAddresses.includes(log.args._depositor.toLowerCase()))
    .map((log, position) => {
      const index = BigInt(position);
      return {
        index,
        secrets: generateDepositSecrets(ctx.keys, ctx.deployment.scope, index),
        depositor: log.args._depositor,
        signerKey: signerKeyFor[log.args._depositor.toLowerCase()],
        label: log.args._label,
        value: log.args._value,
        commitmentHash: log.args._commitment,
        tx: log.transactionHash,
      };
    });
}

/**
 * Waits until the ASP has screened every given label, then returns its published set.
 * Checks the document against its CID (SHA-256) and its root against the root posted on chain.
 */
export async function waitForScreening(ctx, labels, { timeoutMs = 5 * 60_000 } = {}) {
  const wanted = labels.map(String);
  const deadline = Date.now() + timeoutMs;
  let lastCid = null;
  while (Date.now() < deadline) {
    const status = await (await fetch(`${ASP_URL}/`)).json();
    const cid = status.latest?.cid;
    if (cid && cid !== lastCid) {
      lastCid = cid;
      const bytes = new Uint8Array(await (await fetch(`${ASP_URL}/sets/${cid}`)).arrayBuffer());
      const set = JSON.parse(new TextDecoder().decode(bytes));
      const screened = new Set([...set.approvedLabels, ...set.rejected.map((entry) => entry.label)]);
      if (wanted.every((label) => screened.has(label))) {
        verifyCid(bytes, cid);
        const approved = set.approvedLabels.map(BigInt);
        const onchainRoot = await ctx.publicClient.readContract({
          address: ctx.deployment.entrypoint,
          abi: entrypointAbi,
          functionName: "latestRoot",
        });
        const localRoot = approved.length === 1 ? approved[0] : generateMerkleProof(approved, approved[0]).root;
        if (localRoot !== onchainRoot || String(onchainRoot) !== set.root) {
          throw new Error("Published set does not match the root on chain");
        }
        return { cid, set, approved, root: onchainRoot, tx: status.latest.tx };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error(`ASP did not screen ${wanted.length} label(s) within ${timeoutMs / 1000} s`);
}

/** Recomputes a raw CIDv1 (sha2-256) and compares its digest with the one inside `cid`. */
function verifyCid(bytes, cid) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let buffer = 0;
  const decoded = [];
  for (const char of cid.slice(1)) {
    buffer = (buffer << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      decoded.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const digest = Buffer.from(decoded.slice(4)).toString("hex");
  if (digest !== createHash("sha256").update(bytes).digest("hex")) throw new Error(`Set document does not match CID ${cid}`);
}

/** The fresh account for a note: derived from the note mnemonic, so it can always be recovered. */
export function freshAccount(ctx, note) {
  return mnemonicToAccount(ctx.vars.TESTNET_NOTE_MNEMONIC, { addressIndex: FRESH_ADDRESS_INDEX_BASE + Number(note.index) });
}

/** snarkjs proof → the struct the contracts take (pB coordinates swapped, as the SDK does). */
export function formatProof(proof) {
  const p = proof.proof;
  return {
    pA: [p.pi_a[0], p.pi_a[1]].map(String),
    pB: [
      [p.pi_b[0][1], p.pi_b[0][0]].map(String),
      [p.pi_b[1][1], p.pi_b[1][0]].map(String),
    ],
    pC: [p.pi_c[0], p.pi_c[1]].map(String),
    pubSignals: proof.publicSignals.map(String),
  };
}

/**
 * Builds and checks a withdrawal proof of `amount` from `note`, paid to `recipient` through the
 * Entrypoint, with `relayFeeBps` of it to `feeRecipient`. The terms are bound to the proof.
 */
export async function proveWithdrawal(ctx, note, amount, approvedLabels, { recipient, feeRecipient, relayFeeBps }) {
  const { deployment, publicClient } = ctx;
  const leaves = (await poolLogs(ctx, "LeafInserted"))
    .sort((a, b) => Number(a.args._index - b.args._index))
    .map((log) => log.args._leaf);
  const stateProof = generateMerkleProof(leaves, note.commitmentHash);
  const poolRoot = await publicClient.readContract({ address: deployment.pool, abi: poolAbi, functionName: "currentRoot" });
  if (stateProof.root !== poolRoot) throw new Error("Local state tree does not match the pool root");
  // Throws "Leaf not found" when the ASP did not approve this deposit: no private withdrawal possible.
  const aspProof = generateMerkleProof(approvedLabels, note.label);

  const withdrawal = {
    processooor: deployment.entrypoint,
    data: encodeAbiParameters(
      [{ type: "tuple", components: [{ type: "address" }, { type: "address" }, { type: "uint256" }] }],
      [[recipient, feeRecipient, relayFeeBps]],
    ),
  };
  const change = generateWithdrawalSecrets(ctx.keys, note.label, 0n);
  const started = Date.now();
  const proof = await ctx.sdk.proveWithdrawal(getCommitment(note.value, note.label, note.secrets.nullifier, note.secrets.secret), {
    context: BigInt(calculateContext(withdrawal, deployment.scope)),
    withdrawalAmount: amount,
    stateMerkleProof: stateProof,
    aspMerkleProof: aspProof,
    stateRoot: stateProof.root,
    stateTreeDepth: leanTreeDepth(leaves.length),
    aspRoot: aspProof.root,
    aspTreeDepth: leanTreeDepth(approvedLabels.length),
    newSecret: change.secret,
    newNullifier: change.nullifier,
  });
  const proofSeconds = ((Date.now() - started) / 1000).toFixed(1);
  if (!(await ctx.sdk.verifyWithdrawal(proof))) throw new Error("Proof failed local verification");
  console.log(`  proof generated and verified locally in ${proofSeconds} s`);
  return { withdrawal, proof, proofSeconds };
}

/** Proves and relays a private withdrawal of `amount` from `note` to a fresh address (no swap). */
export async function withdrawToFresh(ctx, note, amount, approvedLabels) {
  const { deployment, publicClient, vars } = ctx;
  const fresh = freshAccount(ctx, note).address;
  console.log(`  fresh address: ${fresh}`);
  const { TESTNET_DEPLOYER_KEY: relayerKey } = vars; // direct relay from a script; the relayer service does pieces
  const relayerAddress = clients(relayerKey).account.address;
  const { withdrawal, proof, proofSeconds } = await proveWithdrawal(ctx, note, amount, approvedLabels, {
    recipient: fresh,
    feeRecipient: relayerAddress,
    relayFeeBps: RELAY_FEE_BPS,
  });
  const balanceOf = () => publicClient.readContract({ address: deployment.usdg, abi: usdgAbi, functionName: "balanceOf", args: [fresh] });
  const before = await balanceOf();
  const relayer = new ContractInteractionsService(RPC_URL, robinhoodTestnet, deployment.entrypoint, relayerKey);
  const { hash } = await relayer.relay(withdrawal, proof, deployment.scope);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`relay reverted: ${txLink(hash)}`);
  console.log(`  relay: ${txLink(hash)}`);

  const received = (await balanceOf()) - before;
  const expected = amount - (amount * RELAY_FEE_BPS) / 10_000n;
  if (received !== expected) throw new Error(`Fresh address received ${show(received)}, expected ${show(expected)}`);
  const freshEth = await publicClient.getBalance({ address: fresh });
  return { tx: hash, fresh, received, proofSeconds, freshEth };
}

/** Takes a deposit back to the wallet that made it (the exit for deposits the ASP left out). */
export async function ragequit(ctx, note) {
  const { deployment, publicClient } = ctx;
  const proof = await ctx.sdk.proveCommitment(note.value, note.label, note.secrets.nullifier, note.secrets.secret);
  const balanceOf = () =>
    publicClient.readContract({ address: deployment.usdg, abi: usdgAbi, functionName: "balanceOf", args: [note.depositor] });
  const before = await balanceOf();
  const owner = new ContractInteractionsService(RPC_URL, robinhoodTestnet, deployment.entrypoint, note.signerKey);
  const { hash } = await owner.ragequit(proof, deployment.pool);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`ragequit reverted: ${txLink(hash)}`);
  console.log(`  ragequit: ${txLink(hash)}`);
  return { tx: hash, returned: (await balanceOf()) - before };
}
