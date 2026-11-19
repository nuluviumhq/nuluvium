// IPFS content identifier (CIDv1, raw codec, SHA-256) for the published approved-set document.
// Anyone can hash the document served at /sets/<cid> and check it matches the CID posted on chain.
// The format is small enough to build by hand, so no IPFS library is needed:
//   "b" (base32 lower, RFC 4648, no padding) + [0x01 CIDv1, 0x55 raw, 0x12 sha2-256, 0x20 length, digest]

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base32(bytes) {
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

/** @param {Uint8Array} content @returns {Promise<string>} 59-character CIDv1 */
export async function rawCid(content) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", content));
  return "b" + base32(new Uint8Array([0x01, 0x55, 0x12, 0x20, ...digest]));
}
