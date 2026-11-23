// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@oz/access/Ownable2Step.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

/// @title RelayerRegistry
/// @notice Relayers bond the bond token (testnet: tNLV) to register an address and a public URL.
///         NuluviumRouterV2 only accepts pieces sent by an active relayer. Clients read the active list
///         to pick a relayer.
///
///         Leaving takes two steps: `requestUnbond` stops the relayer at once, and `withdraw` returns
///         the bond after UNBOND_DELAY. The bond stays slashable during that wait, so misbehaviour
///         found after a relayer stops can still be acted on.
///
///         The owner (a Safe) can slash part of a bond and remove a relayer. In this version both
///         are decisions of the Safe signers, not automatic: nothing on chain proves misbehaviour.
/// @dev Registration is open: anyone with MIN_BOND can register. Not upgradeable. Holds only bonds.
contract RelayerRegistry is Ownable2Step {
  using SafeERC20 for IERC20;

  struct Relayer {
    uint256 bond;
    uint64 unbondAvailableAt; // 0 = not leaving; otherwise the time `withdraw` opens
    bool active;
    string url; // public HTTPS base URL of the relayer's API
  }

  /// @notice What clients read for each active relayer.
  struct RelayerInfo {
    address relayer;
    string url;
    uint256 bond;
  }

  uint256 public constant UNBOND_DELAY = 7 days;
  uint256 public constant MAX_URL_LENGTH = 200;

  IERC20 public immutable BOND_TOKEN;
  /// @notice Smallest bond an active relayer may hold.
  uint256 public immutable MIN_BOND;

  mapping(address relayer => Relayer record) private records;
  address[] private activeList;
  /// @dev Position in activeList plus one; 0 = not in the list.
  mapping(address relayer => uint256 indexPlusOne) private activeIndex;

  event Registered(address indexed relayer, string url, uint256 bond);
  event BondAdded(address indexed relayer, uint256 amount, uint256 bond);
  event UrlChanged(address indexed relayer, string url);
  event UnbondRequested(address indexed relayer, uint256 availableAt);
  event Withdrawn(address indexed relayer, uint256 amount);
  event Slashed(address indexed relayer, uint256 amount, uint256 bondLeft, string reason);
  event Removed(address indexed relayer, uint256 availableAt, string reason);

  error AlreadyRegistered();
  error NotActive();
  error NotLeaving();
  error UnbondNotReady(uint256 availableAt);
  error BondTooSmall(uint256 bond, uint256 minBond);
  error InvalidUrl();
  error SlashAboveBond(uint256 amount, uint256 bond);
  error ZeroAmount();

  constructor(IERC20 bondToken, uint256 minBond, address initialOwner) Ownable(initialOwner) {
    BOND_TOKEN = bondToken;
    MIN_BOND = minBond;
  }

  /*///////////////////////////////////////////////////////////////
                              RELAYER
  //////////////////////////////////////////////////////////////*/

  /// @notice Registers the caller with `amount` of bond (approve it first) and a public URL.
  /// @dev A relayer that left must `withdraw` before it registers again.
  function register(string calldata url, uint256 amount) external {
    Relayer storage record = records[msg.sender];
    if (record.active || record.unbondAvailableAt != 0) revert AlreadyRegistered();
    if (amount < MIN_BOND) revert BondTooSmall(amount, MIN_BOND);
    _checkUrl(url);

    record.bond = amount;
    record.active = true;
    record.url = url;
    activeList.push(msg.sender);
    activeIndex[msg.sender] = activeList.length;

    BOND_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
    emit Registered(msg.sender, url, amount);
  }

  /// @notice Adds `amount` to the caller's bond (approve it first).
  function addBond(uint256 amount) external {
    if (amount == 0) revert ZeroAmount();
    Relayer storage record = records[msg.sender];
    if (!record.active) revert NotActive();
    record.bond += amount;
    BOND_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
    emit BondAdded(msg.sender, amount, record.bond);
  }

  /// @notice Changes the caller's public URL.
  function setUrl(string calldata url) external {
    Relayer storage record = records[msg.sender];
    if (!record.active) revert NotActive();
    _checkUrl(url);
    record.url = url;
    emit UrlChanged(msg.sender, url);
  }

  /// @notice Stops relaying now; the bond can be withdrawn after UNBOND_DELAY.
  function requestUnbond() external {
    Relayer storage record = records[msg.sender];
    if (!record.active) revert NotActive();
    uint256 availableAt = _deactivate(msg.sender, record);
    emit UnbondRequested(msg.sender, availableAt);
  }

  /// @notice Returns what is left of the bond after the delay and clears the record.
  function withdraw() external {
    Relayer storage record = records[msg.sender];
    uint256 availableAt = record.unbondAvailableAt;
    if (availableAt == 0) revert NotLeaving();
    if (block.timestamp < availableAt) revert UnbondNotReady(availableAt);
    uint256 amount = record.bond;
    delete records[msg.sender];
    if (amount > 0) BOND_TOKEN.safeTransfer(msg.sender, amount);
    emit Withdrawn(msg.sender, amount);
  }

  /*///////////////////////////////////////////////////////////////
                              OWNER
  //////////////////////////////////////////////////////////////*/

  /// @notice Takes `amount` of a relayer's bond and sends it to the owner (the Safe). Works on
  ///         active relayers and on relayers waiting to withdraw. An active relayer left below
  ///         MIN_BOND is removed (its rest can be withdrawn after the delay).
  /// @param reason Short public note of why, kept in the event.
  function slash(address relayer, uint256 amount, string calldata reason) external onlyOwner {
    if (amount == 0) revert ZeroAmount();
    Relayer storage record = records[relayer];
    if (amount > record.bond) revert SlashAboveBond(amount, record.bond);
    record.bond -= amount;
    emit Slashed(relayer, amount, record.bond, reason);

    if (record.active && record.bond < MIN_BOND) {
      uint256 availableAt = _deactivate(relayer, record);
      emit Removed(relayer, availableAt, "bond below minimum after slash");
    }
    BOND_TOKEN.safeTransfer(owner(), amount);
  }

  /// @notice Stops a relayer now, like its own `requestUnbond`; the bond stays slashable for the delay.
  function remove(address relayer, string calldata reason) external onlyOwner {
    Relayer storage record = records[relayer];
    if (!record.active) revert NotActive();
    uint256 availableAt = _deactivate(relayer, record);
    emit Removed(relayer, availableAt, reason);
  }

  /*///////////////////////////////////////////////////////////////
                              READ
  //////////////////////////////////////////////////////////////*/

  /// @notice True when `relayer` may send pieces through NuluviumRouterV2.
  function isActive(address relayer) external view returns (bool) {
    return records[relayer].active;
  }

  /// @notice Full record of any address (active, leaving, or empty).
  function relayerOf(address relayer) external view returns (Relayer memory) {
    return records[relayer];
  }

  function activeCount() external view returns (uint256) {
    return activeList.length;
  }

  /// @notice Every active relayer with its URL and bond. The order changes when relayers leave.
  function activeRelayers() external view returns (RelayerInfo[] memory list) {
    uint256 count = activeList.length;
    list = new RelayerInfo[](count);
    for (uint256 i = 0; i < count; ++i) {
      address relayer = activeList[i];
      list[i] = RelayerInfo({relayer: relayer, url: records[relayer].url, bond: records[relayer].bond});
    }
  }

  /*///////////////////////////////////////////////////////////////
                              INTERNAL
  //////////////////////////////////////////////////////////////*/

  /// @dev Marks inactive, starts the withdrawal clock and removes from the active list (swap and pop).
  function _deactivate(address relayer, Relayer storage record) private returns (uint256 availableAt) {
    availableAt = block.timestamp + UNBOND_DELAY;
    record.active = false;
    // casting to 'uint64' is safe because a unix time plus 7 days fits in 64 bits for billions of years
    // forge-lint: disable-next-line(unsafe-typecast)
    record.unbondAvailableAt = uint64(availableAt);

    uint256 index = activeIndex[relayer] - 1;
    uint256 last = activeList.length - 1;
    if (index != last) {
      address moved = activeList[last];
      activeList[index] = moved;
      activeIndex[moved] = index + 1;
    }
    activeList.pop();
    delete activeIndex[relayer];
  }

  function _checkUrl(string calldata url) private pure {
    uint256 length = bytes(url).length;
    if (length == 0 || length > MAX_URL_LENGTH) revert InvalidUrl();
  }
}
