// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {ERC20} from "@oz/token/ERC20/ERC20.sol";

/// @title TestNLV
/// @notice Testnet token for the relayer bond ("Test NLV", tNLV). It has no value and no sale:
///         the only way to get it is `claim`, which mints a fixed amount to the caller at most once
///         a day. A relayer claims once, then bonds it in the RelayerRegistry.
/// @dev No owner, no premint, no other mint path. Never deploy this to mainnet.
contract TestNLV is ERC20 {
  /// @notice tNLV minted per claim; equal to the registry's minimum bond, so one claim is enough.
  uint256 public constant CLAIM_AMOUNT = 1000e18;
  /// @notice Time an address waits between two claims.
  uint256 public constant CLAIM_COOLDOWN = 1 days;

  /// @notice Unix time of each address's last claim (0 = never claimed).
  mapping(address account => uint256 timestamp) public lastClaimAt;

  event Claimed(address indexed account, uint256 amount);

  error ClaimTooSoon(uint256 availableAt);

  constructor() ERC20("Test NLV", "tNLV") {}

  /// @notice Mints CLAIM_AMOUNT tNLV to the caller; again only after CLAIM_COOLDOWN.
  function claim() external {
    uint256 last = lastClaimAt[msg.sender];
    if (last != 0 && block.timestamp < last + CLAIM_COOLDOWN) revert ClaimTooSoon(last + CLAIM_COOLDOWN);
    lastClaimAt[msg.sender] = block.timestamp;
    _mint(msg.sender, CLAIM_AMOUNT);
    emit Claimed(msg.sender, CLAIM_AMOUNT);
  }
}
