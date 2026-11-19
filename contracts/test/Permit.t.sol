// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {ForkTest} from "./ForkTest.sol";

/// Minimal EIP-2612 surface shared by USDG and the stock tokens.
interface IERC20Permit {
  function permit(
    address owner,
    address spender,
    uint256 value,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external;
  function nonces(address owner) external view returns (uint256);
  function allowance(address owner, address spender) external view returns (uint256);
  // forge-lint: disable-next-line(mixed-case-function)
  function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// The Router design depends on one fact: a fresh address that holds no ETH can approve the Router
/// with a signature alone (EIP-2612), and the relayer submits it. These fork tests check that
/// against real token contracts on Robinhood Chain mainnet and testnet.
contract PermitForkTest is ForkTest {
  bytes32 private constant PERMIT_TYPEHASH =
    keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

  // Robinhood Chain mainnet (chain id 4663).
  address private constant MAINNET_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
  address private constant MAINNET_NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
  // Robinhood Chain testnet (chain id 46630), see docs/testnet.md.
  address private constant TESTNET_TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;

  // Stand-ins for a piece's fresh address and the Nuluvium Router.
  uint256 private constant FRESH_KEY = 0xA11CE;
  address private constant ROUTER = address(0xB0B);

  function test_mainnetUsdgAcceptsPermitFromFreshKey() public {
    _fork("robinhood_mainnet");
    _assertPermitWorks(IERC20Permit(MAINNET_USDG), 25e6); // 25 USDG, 6 decimals
  }

  function test_mainnetStockTokenAcceptsPermitFromFreshKey() public {
    _fork("robinhood_mainnet");
    _assertPermitWorks(IERC20Permit(MAINNET_NVDA), 0.1e18);
  }

  function test_testnetStockTokenAcceptsPermitFromFreshKey() public {
    _fork("robinhood_testnet");
    _assertPermitWorks(IERC20Permit(TESTNET_TSLA), 0.1e18);
  }

  function test_mainnetUsdgRejectsPermitSignedByAnotherKey() public {
    _fork("robinhood_mainnet");
    IERC20Permit token = IERC20Permit(MAINNET_USDG);
    address owner = vm.addr(FRESH_KEY);
    uint256 deadline = block.timestamp + 10 minutes;

    // Signed by a different key than the owner: must not grant an allowance.
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, _digest(token, owner, 25e6, deadline));
    vm.expectRevert();
    token.permit(owner, ROUTER, 25e6, deadline, v, r, s);
  }

  function _assertPermitWorks(IERC20Permit token, uint256 value) private {
    address owner = vm.addr(FRESH_KEY);
    uint256 deadline = block.timestamp + 10 minutes;
    uint256 nonceBefore = token.nonces(owner);

    (uint8 v, bytes32 r, bytes32 s) = vm.sign(FRESH_KEY, _digest(token, owner, value, deadline));

    // Anyone (the relayer) may submit the signed permit; the fresh address never pays gas.
    vm.prank(address(0xDEAD));
    token.permit(owner, ROUTER, value, deadline, v, r, s);

    assertEq(token.allowance(owner, ROUTER), value, "allowance not set");
    assertEq(token.nonces(owner), nonceBefore + 1, "nonce not used");
  }

  function _digest(IERC20Permit token, address owner, uint256 value, uint256 deadline)
    private
    view
    returns (bytes32)
  {
    bytes32 structHash =
      keccak256(abi.encode(PERMIT_TYPEHASH, owner, ROUTER, value, token.nonces(owner), deadline));
    return keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
  }
}
