// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {ISwapRouter02} from "../src/NuluviumRouter.sol";
import {IRelayerRegistry, NuluviumRouterV2} from "../src/NuluviumRouterV2.sol";
import {RelayerRegistry} from "../src/RelayerRegistry.sol";
import {TestNLV} from "../src/TestNLV.sol";
import {IEntrypoint} from "interfaces/IEntrypoint.sol";
import {ForkTest} from "./ForkTest.sol";
import {IQuoterV2} from "./NuluviumRouterFork.t.sol";
import {RouterV2Signing} from "./NuluviumRouterV2.t.sol";

/// Router v2 against real Robinhood Chain mainnet state (USDG, NVDA, its 0.05% Uniswap v3 pool,
/// SwapRouter02, QuoterV2): a registered relayer sends a buy and a sell for a fresh key with no ETH;
/// the protocol fee is split between the relayer and the treasury.
contract NuluviumRouterV2ForkTest is RouterV2Signing, ForkTest {
  IERC20 private constant USDG = IERC20(0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168);
  IERC20 private constant NVDA = IERC20(0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC);
  ISwapRouter02 private constant SWAP_ROUTER = ISwapRouter02(0xCaf681a66D020601342297493863E78C959E5cb2);
  IQuoterV2 private constant QUOTER = IQuoterV2(0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7);
  address private constant USDG_NVDA_POOL = 0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3;
  uint24 private constant TIER = 500;
  uint256 private constant FRESH_KEY = 0xF8E5;

  NuluviumRouterV2 private router;
  address private owner = makeAddr("owner");
  address private treasury = makeAddr("treasury");
  address private relayer = makeAddr("relayer");
  address private fresh;

  function setUp() public {
    _fork("robinhood_mainnet");
    TestNLV nlv = new TestNLV();
    RelayerRegistry registry = new RelayerRegistry(IERC20(address(nlv)), 1000e18, owner);
    // No Privacy Pools deployment on mainnet yet; relayAndSwap is covered by unit tests.
    router = new NuluviumRouterV2(USDG, SWAP_ROUTER, IEntrypoint(address(0)), IRelayerRegistry(address(registry)), treasury, owner);
    vm.prank(owner);
    router.setPoolFee(address(NVDA), TIER);
    _registerRelayer(nlv, registry, relayer, "https://relayer.example");
    fresh = vm.addr(FRESH_KEY);

    vm.prank(USDG_NVDA_POOL);
    USDG.transfer(fresh, 100e6);
  }

  function _quote(IERC20 tokenIn, IERC20 tokenOut, uint256 amountIn) private returns (uint256 amountOut) {
    (amountOut,,,) = QUOTER.quoteExactInputSingle(
      IQuoterV2.QuoteExactInputSingleParams(address(tokenIn), address(tokenOut), amountIn, TIER, 0)
    );
  }

  function _execute(IERC20 tokenIn, IERC20 tokenOut, uint256 amountIn, uint256 minOut, uint256 fee, uint256 nonce)
    private
    returns (uint256)
  {
    NuluviumRouterV2.Order memory order = NuluviumRouterV2.Order({
      owner: fresh,
      tokenIn: address(tokenIn),
      tokenOut: address(tokenOut),
      amountIn: amountIn,
      minAmountOut: minOut,
      maxFee: fee,
      nonce: nonce,
      deadline: block.timestamp + 10 minutes
    });
    bytes memory signature = _signOrderV2(router, order, FRESH_KEY);
    NuluviumRouterV2.PermitSignature memory permit = _signPermitV2(address(tokenIn), address(router), amountIn, FRESH_KEY);
    vm.prank(relayer);
    return router.swap(order, signature, permit, fee);
  }

  function test_freshKeyBuysThenSellsNvdaWithTheProtocolFee() public {
    uint256 fee = 0.1e6;
    assertEq(fresh.balance, 0, "fresh address must not need ETH");

    // Buy: 100 USDG in; 0.10 gas fee and 0.10 protocol fee out; 99.8 USDG swapped.
    uint256 quoted = _quote(USDG, NVDA, 100e6 - fee - 0.1e6);
    uint256 bought = _execute(USDG, NVDA, 100e6, quoted, fee, 1);
    assertEq(bought, quoted, "buy matches the quote for the net amount");
    assertEq(USDG.balanceOf(relayer), 0.15e6);
    assertEq(USDG.balanceOf(treasury), 0.05e6);
    emit log_named_decimal_uint("NVDA bought for 99.8 USDG", bought, 18);

    // Sell all of it back: protocol fee on the USDG received.
    uint256 gross = _quote(NVDA, USDG, bought);
    uint256 net = gross - fee - router.protocolFeeFor(gross);
    uint256 sold = _execute(NVDA, USDG, bought, net, fee, 2);
    assertEq(sold, net);
    assertEq(USDG.balanceOf(fresh), net);
    assertEq(NVDA.balanceOf(fresh), 0);
    assertEq(USDG.balanceOf(treasury), 0.05e6 + router.protocolFeeFor(gross) - router.protocolFeeFor(gross) / 2);
    assertEq(fresh.balance, 0, "fresh address still holds no ETH");
    assertEq(USDG.balanceOf(address(router)), 0, "router holds USDG");
    assertEq(NVDA.balanceOf(address(router)), 0, "router holds NVDA");
    emit log_named_decimal_uint("USDG back after selling (round trip from 100)", sold, 6);
  }
}
