// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {ERC20} from "@oz/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@oz/token/ERC20/extensions/ERC20Permit.sol";

/// @title MockUSDG
/// @notice Testnet stand-in for USDG (Global Dollar). Robinhood Chain testnet has no official USDG
///         (docs/testnet.md), so we deploy our own with the two properties our flow depends on:
///         6 decimals and EIP-2612 permit.
/// @dev Anyone can mint. Never deploy this to mainnet.
contract MockUSDG is ERC20, ERC20Permit {
  /// @notice Largest amount one call may mint (1,000,000 USDG), to keep test balances sane.
  uint256 public constant MAX_MINT = 1_000_000e6;

  error MintTooLarge();

  constructor() ERC20("Nuluvium Test USDG", "tUSDG") ERC20Permit("Nuluvium Test USDG") {}

  function decimals() public pure override returns (uint8) {
    return 6;
  }

  /// @notice Mints test tokens to `to`.
  function mint(address to, uint256 amount) external {
    if (amount > MAX_MINT) revert MintTooLarge();
    _mint(to, amount);
  }
}
