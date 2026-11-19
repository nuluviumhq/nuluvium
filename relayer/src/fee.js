// Relayer fee quote. Pure, so it can be tested without a chain.
//
// fee (USDG units, 6 decimals) = max(minimum, gas per piece × gas price × ETH price × margin)
// At Robinhood Chain gas prices (about 0.01 gwei) the gas part is cents, so the minimum decides.

const WEI_PER_ETH = 10n ** 18n;
const USDG_UNITS = 10n ** 6n;

/**
 * @param {{gasPerPiece: bigint, gasPriceWei: bigint, ethUsdCents: bigint, marginPercent: bigint, minimumFee: bigint}} input
 * @returns {{fee: bigint, gasCost: bigint}} fee and the gas part alone, both in USDG units
 */
export function quoteFee({ gasPerPiece, gasPriceWei, ethUsdCents, marginPercent, minimumFee }) {
  // wei × cents/ETH → USDG units: × 1e6 / (1e18 × 100). Rounded up so the relayer never loses.
  const numerator = gasPerPiece * gasPriceWei * ethUsdCents * USDG_UNITS * marginPercent;
  const denominator = WEI_PER_ETH * 100n * 100n;
  const gasCost = (numerator + denominator - 1n) / denominator;
  return { fee: gasCost > minimumFee ? gasCost : minimumFee, gasCost };
}
