// Everything secret derives from one user secret, so nothing secret is ever stored:
//   - note keys (Privacy Pools master nullifier and master secret)
//   - one fresh address per piece, at m/44'/60'/1'/<deposit index>/<piece number>
// In v1 the secret is a BIP-39 mnemonic; the web app (1.8) derives it from a wallet signature.

import { generateMasterKeys } from "@0xbow/privacy-pools-core-sdk";
import { entropyToMnemonic, generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist as english } from "@scure/bip39/wordlists/english";
import { hexToBytes, keccak256, type Hex } from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";

export interface UserKeys {
  readonly mnemonic: string;
  readonly masterKeys: ReturnType<typeof generateMasterKeys>;
}

/** HD account index reserved for fresh addresses (account 0 stays the user's normal wallet path). */
const FRESH_ACCOUNT_INDEX = 1;

/** Bump only with a migration: a new message gives every user new keys (and an empty balance). */
export const KEY_MESSAGE_VERSION = 1;

/**
 * The message a person signs with their wallet to unlock Nuluvium. The signature is the secret,
 * so it must never leave the browser. Fixed text per address and network: the same wallet always
 * gets the same keys.
 */
export function keyMessage(address: string, chainId: number): string {
  return [
    "Nuluvium key",
    "",
    "Sign to unlock your shielded balance on Nuluvium. This is not a transaction and costs nothing.",
    "The signature stays in your browser; anyone who has it can spend your shielded balance.",
    "",
    `Address: ${address.toLowerCase()}`,
    `Chain: ${chainId}`,
    `Version: ${KEY_MESSAGE_VERSION}`,
  ].join("\n");
}

/**
 * Keys from a wallet signature of `keyMessage`: keccak256(signature) → 128 bits of entropy → a
 * BIP-39 mnemonic → the usual note keys and fresh addresses. Only safe with wallets that sign
 * deterministically (RFC 6979); the app checks that by asking for the signature twice once.
 */
export function keysFromSignature(signature: Hex): UserKeys {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error("expected a 65-byte signature");
  const entropy = hexToBytes(keccak256(signature)).slice(0, 16);
  return keysFromMnemonic(entropyToMnemonic(entropy, english));
}

/** A new random 12-word recovery phrase (128 bits), for people who log in without a wallet. */
export function newMnemonic(): string {
  return generateMnemonic(english, 128);
}

/** True for a 12 or 24 word BIP-39 phrase with a valid checksum (catches typos when restoring). */
export function isValidMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  return (words.length === 12 || words.length === 24) && validateMnemonic(words.join(" "), english);
}

export function keysFromMnemonic(mnemonic: string): UserKeys {
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) throw new Error("mnemonic must have 12 or 24 words");
  return { mnemonic: words.join(" "), masterKeys: generateMasterKeys(words.join(" ")) };
}

/**
 * The secret's normal wallet (m/44'/60'/0'/0/0). An agent holding a mnemonic funds its deposits
 * from here: deposits are public, so this address is the one the world links to the agent.
 */
export function depositAccount(keys: UserKeys): HDAccount {
  return mnemonicToAccount(keys.mnemonic);
}

/**
 * Fresh account for piece `pieceNumber` of the note that came from deposit `depositIndex`.
 * Deterministic, so the user can always find and recover every fresh address.
 */
export function freshAccount(keys: UserKeys, depositIndex: bigint, pieceNumber: number): HDAccount {
  if (depositIndex > 0x7fffffffn || pieceNumber < 0 || pieceNumber > 0x7fffffff) throw new Error("index out of range");
  return mnemonicToAccount(keys.mnemonic, {
    accountIndex: FRESH_ACCOUNT_INDEX,
    changeIndex: Number(depositIndex),
    addressIndex: pieceNumber,
  });
}
