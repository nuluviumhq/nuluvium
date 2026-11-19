// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {ISwapRouter02, NuluviumRouter} from "../src/NuluviumRouter.sol";
import {IEntrypoint} from "interfaces/IEntrypoint.sol";
import {ForkTest} from "./ForkTest.sol";
import {RouterSigning} from "./NuluviumRouter.t.sol";

interface IQuoterV2 {
  struct QuoteExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    uint24 fee;
    uint160 sqrtPriceLimitX96;
  }

  function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
    external
    returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

/// Router against real Robinhood Chain mainnet state: USDG, the NVDA stock token, its USDG pool
/// (0.05% tier) on Uniswap v3, SwapRouter02 and QuoterV2. A fresh key with no ETH buys and sells.
contract NuluviumRouterForkTest is RouterSigning, ForkTest {
  IERC20 private constant USDG = IERC20(0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168);
  IERC20 private constant NVDA = IERC20(0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC);
  ISwapRouter02 private constant SWAP_ROUTER = ISwapRouter02(0xCaf681a66D020601342297493863E78C959E5cb2);
  IQuoterV2 private constant QUOTER = IQuoterV2(0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7);
  address private constant USDG_NVDA_POOL = 0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3;
  uint24 private constant TIER = 500;
  uint256 private constant FRESH_KEY = 0xF8E5;
  uint256 private constant SLIPPAGE_BPS = 100; // 1% below the quote

  NuluviumRouter private router;
  address private owner = makeAddr("owner");
  address private relayer = makeAddr("relayer");
  address private fresh;

  function setUp() public {
    _fork("robinhood_mainnet");
    // No Privacy Pools deployment on mainnet yet; relayAndSwap is covered by unit tests and testnet.
    router = new NuluviumRouter(USDG, SWAP_ROUTER, IEntrypoint(address(0)), owner);
    vm.prank(owner);
    router.setPoolFee(address(NVDA), TIER);
    fresh = vm.addr(FRESH_KEY);

    // Fund the fresh address with 100 USDG from the pool's own balance (fork only).
    vm.prank(USDG_NVDA_POOL);
    USDG.transfer(fresh, 100e6);
  }

  function _quote(IERC20 tokenIn, IERC20 tokenOut, uint256 amountIn) private returns (uint256 amountOut) {
    (amountOut,,,) = QUOTER.quoteExactInputSingle(
      IQuoterV2.QuoteExactInputSingleParams(address(tokenIn), address(tokenOut), amountIn, TIER, 0)
    );
  }

  function _order(IERC20 tokenIn, IERC20 tokenOut, uint256 amountIn, uint256 minOut, uint256 maxFee, uint256 nonce)
    private
    view
    returns (NuluviumRouter.Order memory)
  {
    return NuluviumRouter.Order({
      owner: fresh,
      tokenIn: address(tokenIn),
      tokenOut: address(tokenOut),
      amountIn: amountIn,
      minAmountOut: minOut,
      maxFee: maxFee,
      nonce: nonce,
      deadline: block.timestamp + 10 minutes
    });
  }

  function _execute(NuluviumRouter.Order memory order, uint256 fee) private returns (uint256) {
    bytes memory signature = _signOrder(router, order, FRESH_KEY);
    NuluviumRouter.PermitSignature memory permit = _signPermit(order.tokenIn, address(router), order.amountIn, FRESH_KEY);
    vm.prank(relayer);
    return router.swap(order, signature, permit, fee);
  }

  function test_freshKeyBuysThenSellsNvda() public {
    uint256 fee = 0.5e6;
    assertEq(fresh.balance, 0, "fresh address must not need ETH");

    // Buy: 100 USDG in, 0.5 USDG to the relayer, 99.5 USDG swapped for NVDA.
    uint256 quotedNvda = _quote(USDG, NVDA, 100e6 - fee);
    uint256 minNvda = (quotedNvda * (10_000 - SLIPPAGE_BPS)) / 10_000;
    uint256 bought = _execute(_order(USDG, NVDA, 100e6, minNvda, fee, 1), fee);

    assertEq(bought, quotedNvda, "buy should match the quote in the same block");
    assertEq(NVDA.balanceOf(fresh), bought);
    assertEq(USDG.balanceOf(fresh), 0);
    assertEq(USDG.balanceOf(relayer), fee);
    _assertRouterEmpty();
    emit log_named_decimal_uint("NVDA bought for 99.5 USDG", bought, 18);

    // Sell everything back; the relayer takes its fee from the USDG received.
    uint256 quotedUsdg = _quote(NVDA, USDG, bought);
    uint256 minUsdg = (quotedUsdg * (10_000 - SLIPPAGE_BPS)) / 10_000 - fee;
    uint256 sold = _execute(_order(NVDA, USDG, bought, minUsdg, fee, 2), fee);

    assertEq(sold, quotedUsdg - fee);
    assertEq(USDG.balanceOf(fresh), sold);
    assertEq(NVDA.balanceOf(fresh), 0);
    assertEq(USDG.balanceOf(relayer), 2 * fee);
    assertEq(fresh.balance, 0, "fresh address still holds no ETH");
    _assertRouterEmpty();
    emit log_named_decimal_uint("USDG back after selling (round trip from 100)", sold, 6);
  }

  function test_minimumAboveQuoteReverts() public {
    uint256 quotedNvda = _quote(USDG, NVDA, 100e6);
    NuluviumRouter.Order memory order = _order(USDG, NVDA, 100e6, quotedNvda + 1, 0, 1);
    bytes memory signature = _signOrder(router, order, FRESH_KEY);
    NuluviumRouter.PermitSignature memory permit = _signPermit(address(USDG), address(router), 100e6, FRESH_KEY);

    vm.expectRevert(bytes("Too little received"));
    vm.prank(relayer);
    router.swap(order, signature, permit, 0);
    assertEq(USDG.balanceOf(fresh), 100e6, "owner keeps the USDG");
  }

  function test_allowlistRejectsPoolThatDoesNotExist() public {
    // USDG/NVDA has pools at every tier (100, 500, 3000, 10000), so use a token without any pool.
    address notAStock = makeAddr("notAStock");
    vm.expectRevert(abi.encodeWithSelector(NuluviumRouter.PoolDoesNotExist.selector, notAStock, TIER));
    vm.prank(owner);
    router.setPoolFee(notAStock, TIER);
  }

  function _assertRouterEmpty() private view {
    assertEq(USDG.balanceOf(address(router)), 0, "router holds USDG");
    assertEq(NVDA.balanceOf(address(router)), 0, "router holds NVDA");
    assertEq(USDG.allowance(address(router), address(SWAP_ROUTER)), 0, "router left a USDG allowance");
    assertEq(NVDA.allowance(address(router), address(SWAP_ROUTER)), 0, "router left an NVDA allowance");
  }
}
