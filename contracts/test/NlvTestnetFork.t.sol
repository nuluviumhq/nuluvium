// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {NuluviumRouter} from "../src/NuluviumRouter.sol";
import {NuluviumRouterV2} from "../src/NuluviumRouterV2.sol";
import {RelayerRegistry} from "../src/RelayerRegistry.sol";
import {NlvTestnetSetup} from "../script/NlvTestnetSetup.sol";
import {ForkTest} from "./ForkTest.sol";
import {RouterV2Signing} from "./NuluviumRouterV2.t.sol";

interface IMintable {
  function mint(address to, uint256 amount) external;
}

/// The relayer model on a fork of live testnet, set up exactly as the scripts do it: the deployer
/// deploys (DeployNlvTestnet), the Safe runs its batch (NlvSafeBatchTestnet), relayers 1 and 2 claim
/// tNLV and register (BondRelayerTestnet), then pieces go through Router v2 on the live tUSDG, MSTK and
/// mock swap router.
contract NlvTestnetForkTest is NlvTestnetSetup, RouterV2Signing, ForkTest {
  address private constant ROUTER_V1 = 0x3287C2947f137c20c8BfeB628f800D23b8e5D155;
  address private constant RELAYER_1 = 0x7a7A1f77C957B7C926AA9baF6cE8fA334270c72F;
  address private constant RELAYER_2 = 0x21Ad9f184908b119694Bb0E3365eCa4Acc4155c0;
  uint256 private constant FRESH_KEY = 0xF8E5;

  Existing private existing;
  NlvDeployment private deployed;
  address private deployer;
  address private fresh;

  function setUp() public {
    _fork("robinhood_testnet");
    existing = _existing();
    deployer = vm.parseJsonAddress(vm.readFile("deployments/46630.json"), ".deployer");
    fresh = vm.addr(FRESH_KEY);

    vm.startPrank(deployer);
    deployed = _deployNlv(existing, deployer);
    vm.stopPrank();
  }

  function _runSafeBatch() private {
    _simulateAsSafe(_safeCalls(deployed, existing.mockStock), deployed, existing.mockStock);
  }

  function test_deployerHasNoPowerOnceTheSafeAccepts() public {
    assertEq(deployed.router.pendingOwner(), SAFE);
    assertEq(deployed.registry.pendingOwner(), SAFE);
    assertEq(deployed.router.TREASURY(), SAFE);
    assertEq(address(deployed.router.REGISTRY()), address(deployed.registry));
    assertEq(deployed.router.poolFee(existing.mockStock), 0, "deployer lists nothing");

    _runSafeBatch();

    vm.startPrank(deployer);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, deployer));
    deployed.router.pause();
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, deployer));
    deployed.registry.remove(RELAYER_1, "");
    vm.stopPrank();
  }

  function test_safeBatchRevertsForAnyoneButTheSafe() public {
    SafeCall[] memory calls = _safeCalls(deployed, existing.mockStock);
    address stranger = makeAddr("stranger");
    for (uint256 i = 0; i < calls.length; ++i) {
      vm.prank(stranger);
      (bool ok,) = calls[i].to.call(calls[i].data);
      assertFalse(ok, calls[i].decoded);
    }
    // The deployer cannot take the owner role back either; only the pending owner (the Safe) accepts.
    for (uint256 i = 0; i < 2; ++i) {
      vm.prank(deployer);
      (bool ok,) = calls[i].to.call(calls[i].data);
      assertFalse(ok, calls[i].decoded);
    }
  }

  function test_bothRelayersBondAndSendPiecesWithTheProtocolFee() public {
    _runSafeBatch();
    _registerRelayer(deployed.token, deployed.registry, RELAYER_1, "https://relayer.nuluvium.com");
    _registerRelayer(deployed.token, deployed.registry, RELAYER_2, "https://relayer2.nuluvium.com");

    RelayerRegistry.RelayerInfo[] memory list = deployed.registry.activeRelayers();
    assertEq(list.length, 2);
    assertEq(list[0].relayer, RELAYER_1);
    assertEq(list[1].url, "https://relayer2.nuluvium.com");

    IERC20 usdg = IERC20(existing.usdg);
    IERC20 stock = IERC20(existing.mockStock);
    uint256 treasuryBefore = usdg.balanceOf(SAFE);
    uint256 relayer1Before = usdg.balanceOf(RELAYER_1);
    uint256 relayer2Before = usdg.balanceOf(RELAYER_2);

    // Buy 18 tUSDG of MSTK through relayer 1: gas fee 0.10, protocol fee 0.018 (0.009 each side).
    IMintable(existing.usdg).mint(fresh, 18e6);
    NuluviumRouterV2.Order memory buy = _order(existing.usdg, existing.mockStock, 18e6, 0, 0.1e6, 1);
    uint256 bought = _send(RELAYER_1, buy, 0.1e6);
    // Mock price is 180 tUSDG per MSTK: (18 - 0.10 - 0.018) / 180.
    assertEq(bought, (uint256(17.882e6) * 1e18) / 180e6);
    assertEq(usdg.balanceOf(RELAYER_1) - relayer1Before, 0.109e6);
    assertEq(usdg.balanceOf(SAFE) - treasuryBefore, 0.009e6);

    // Sell it back through relayer 2.
    NuluviumRouterV2.Order memory sell = _order(existing.mockStock, existing.usdg, bought, 0, 0.1e6, 2);
    uint256 gross = (bought * 180e6) / 1e18;
    uint256 sold = _send(RELAYER_2, sell, 0.1e6);
    uint256 protocolFee = deployed.router.protocolFeeFor(gross);
    assertEq(sold, gross - 0.1e6 - protocolFee);
    assertEq(usdg.balanceOf(RELAYER_2) - relayer2Before, 0.1e6 + protocolFee / 2);
    assertEq(stock.balanceOf(fresh), 0);
    assertEq(usdg.balanceOf(address(deployed.router)), 0);

    // Router v1 is untouched: same owner and listing.
    assertEq(NuluviumRouter(ROUTER_V1).owner(), SAFE);
    assertEq(NuluviumRouter(ROUTER_V1).poolFee(existing.mockStock), MSTK_TIER);
  }

  function test_unregisteredRelayerCannotUseRouterV2() public {
    _runSafeBatch();
    IMintable(existing.usdg).mint(fresh, 18e6);
    NuluviumRouterV2.Order memory buy = _order(existing.usdg, existing.mockStock, 18e6, 0, 0.1e6, 1);
    vm.expectRevert(abi.encodeWithSelector(NuluviumRouterV2.NotARegisteredRelayer.selector, RELAYER_1));
    this.sendExternal(RELAYER_1, buy, 0.1e6);
  }

  function _order(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 maxFee, uint256 nonce)
    private
    view
    returns (NuluviumRouterV2.Order memory)
  {
    return NuluviumRouterV2.Order({
      owner: fresh,
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      amountIn: amountIn,
      minAmountOut: minOut,
      maxFee: maxFee,
      nonce: nonce,
      deadline: block.timestamp + 10 minutes
    });
  }

  function _send(address relayer, NuluviumRouterV2.Order memory order, uint256 fee) private returns (uint256) {
    bytes memory signature = _signOrderV2(deployed.router, order, FRESH_KEY);
    NuluviumRouterV2.PermitSignature memory permit =
      _signPermitV2(order.tokenIn, address(deployed.router), order.amountIn, FRESH_KEY);
    vm.prank(relayer);
    return deployed.router.swap(order, signature, permit, fee);
  }

  function sendExternal(address relayer, NuluviumRouterV2.Order memory order, uint256 fee) external returns (uint256) {
    return _send(relayer, order, fee);
  }
}
