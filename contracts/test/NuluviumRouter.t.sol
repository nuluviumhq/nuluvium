// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Pausable} from "@oz/utils/Pausable.sol";
import {Test} from "forge-std/Test.sol";

import {MockUSDG} from "../src/MockUSDG.sol";
import {ISwapRouter02, NuluviumRouter} from "../src/NuluviumRouter.sol";
import {ProofLib} from "contracts/lib/ProofLib.sol";
import {IEntrypoint} from "interfaces/IEntrypoint.sol";
import {IPrivacyPool} from "interfaces/IPrivacyPool.sol";

import {MockEntrypoint, MockFactory, MockQuoterV2, MockStock, MockSwapRouter} from "./mocks/RouterMocks.sol";

/// Shared signing helpers for Router tests (also used by the mainnet fork test).
abstract contract RouterSigning is Test {
  bytes32 internal constant PERMIT_TYPEHASH =
    keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

  function _signOrder(NuluviumRouter router, NuluviumRouter.Order memory order, uint256 key)
    internal
    view
    returns (bytes memory)
  {
    bytes32 structHash = keccak256(abi.encode(router.ORDER_TYPEHASH(), order));
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", router.DOMAIN_SEPARATOR(), structHash));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
    return abi.encodePacked(r, s, v);
  }

  function _signPermit(address token, address spender, uint256 value, uint256 key)
    internal
    view
    returns (NuluviumRouter.PermitSignature memory permit)
  {
    address owner = vm.addr(key);
    permit.deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(PERMIT_TYPEHASH, owner, spender, value, IPermitNonces(token).nonces(owner), permit.deadline)
    );
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", IPermitNonces(token).DOMAIN_SEPARATOR(), structHash));
    (permit.v, permit.r, permit.s) = vm.sign(key, digest);
  }
}

interface IPermitNonces {
  function nonces(address owner) external view returns (uint256);
  // forge-lint: disable-next-line(mixed-case-function)
  function DOMAIN_SEPARATOR() external view returns (bytes32);
}

contract NuluviumRouterTest is RouterSigning {
  uint24 private constant TIER = 500;
  uint256 private constant FRESH_KEY = 0xF8E5;

  MockUSDG private usdg;
  MockStock private stock;
  MockFactory private factory;
  MockSwapRouter private swapRouter;
  MockEntrypoint private entrypoint;
  NuluviumRouter private router;

  address private owner = makeAddr("owner");
  address private relayer = makeAddr("relayer");
  address private fresh;

  function setUp() public {
    usdg = new MockUSDG();
    stock = new MockStock();
    factory = new MockFactory();
    swapRouter = new MockSwapRouter(address(factory), address(usdg), 200e6); // 1 stock = 200 USDG
    factory.setPool(address(usdg), address(stock), TIER, makeAddr("pool"));
    entrypoint = new MockEntrypoint(address(usdg));
    router = new NuluviumRouter(IERC20(address(usdg)), ISwapRouter02(address(swapRouter)), IEntrypoint(address(entrypoint)), owner);
    vm.prank(owner);
    router.setPoolFee(address(stock), TIER);
    fresh = vm.addr(FRESH_KEY);
  }

  function _buyOrder(uint256 amountIn, uint256 minOut, uint256 maxFee, uint256 nonce)
    private
    view
    returns (NuluviumRouter.Order memory)
  {
    return NuluviumRouter.Order({
      owner: fresh,
      tokenIn: address(usdg),
      tokenOut: address(stock),
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

  /*////////////////////////////////////////////////////////////// buy and sell */

  function test_buyWithPermitFromAddressWithoutEth() public {
    usdg.mint(fresh, 100e6);
    assertEq(fresh.balance, 0);

    uint256 received = _execute(_buyOrder(100e6, 0.49e18, 1e6, 1), 1e6);

    // 99 USDG swapped at 200 USDG per token = 0.495 tokens; 1 USDG to the relayer.
    assertEq(received, 0.495e18);
    assertEq(stock.balanceOf(fresh), 0.495e18);
    assertEq(usdg.balanceOf(relayer), 1e6);
    assertEq(usdg.balanceOf(fresh), 0);
    assertEq(swapRouter.lastFee(), TIER);
    _assertRouterEmpty();
  }

  function test_sellPaysUsdgToOwnerAndFeeToRelayer() public {
    stock.mint(fresh, 1e18);
    NuluviumRouter.Order memory order = NuluviumRouter.Order({
      owner: fresh,
      tokenIn: address(stock),
      tokenOut: address(usdg),
      amountIn: 1e18,
      minAmountOut: 195e6,
      maxFee: 2e6,
      nonce: 7,
      deadline: block.timestamp + 10 minutes
    });

    uint256 received = _execute(order, 2e6);

    assertEq(received, 198e6); // 200 USDG out of the pool, 2 to the relayer
    assertEq(usdg.balanceOf(fresh), 198e6);
    assertEq(usdg.balanceOf(relayer), 2e6);
    assertEq(stock.balanceOf(fresh), 0);
    _assertRouterEmpty();
  }

  /*////////////////////////////////////////////////////////////// signed terms */

  function test_revertsWhenSignedByAnotherKey() public {
    usdg.mint(fresh, 100e6);
    NuluviumRouter.Order memory order = _buyOrder(100e6, 0, 0, 1);
    bytes memory wrongSignature = _signOrder(router, order, 0xBAD);
    NuluviumRouter.PermitSignature memory permit = _signPermit(address(usdg), address(router), 100e6, FRESH_KEY);

    vm.expectRevert(NuluviumRouter.InvalidSignature.selector);
    router.swap(order, wrongSignature, permit, 0);
  }

  function test_relayerCannotChangeSignedTerms() public {
    usdg.mint(fresh, 100e6);
    NuluviumRouter.Order memory order = _buyOrder(100e6, 0.49e18, 0, 1);
    bytes memory signature = _signOrder(router, order, FRESH_KEY);
    NuluviumRouter.PermitSignature memory permit = _signPermit(address(usdg), address(router), 100e6, FRESH_KEY);

    order.minAmountOut = 0; // relayer tries to loosen the minimum
    vm.expectRevert(NuluviumRouter.InvalidSignature.selector);
    router.swap(order, signature, permit, 0);
  }

  function test_orderCannotBeReplayed() public {
    usdg.mint(fresh, 200e6);
    _execute(_buyOrder(100e6, 0, 0, 42), 0);

    NuluviumRouter.Order memory again = _buyOrder(100e6, 0, 0, 42);
    bytes memory signature = _signOrder(router, again, FRESH_KEY);
    NuluviumRouter.PermitSignature memory permit = _signPermit(address(usdg), address(router), 100e6, FRESH_KEY);
    vm.expectRevert(NuluviumRouter.NonceAlreadyUsed.selector);
    router.swap(again, signature, permit, 0);
  }

  function test_revertsAfterDeadline() public {
    usdg.mint(fresh, 100e6);
    NuluviumRouter.Order memory order = _buyOrder(100e6, 0, 0, 1);
    bytes memory signature = _signOrder(router, order, FRESH_KEY);
    NuluviumRouter.PermitSignature memory permit = _signPermit(address(usdg), address(router), 100e6, FRESH_KEY);

    vm.warp(order.deadline + 1);
    vm.expectRevert(NuluviumRouter.OrderExpired.selector);
    router.swap(order, signature, permit, 0);
  }

  function test_feeAboveSignedMaximumReverts() public {
    usdg.mint(fresh, 100e6);
    NuluviumRouter.Order memory order = _buyOrder(100e6, 0, 1e6, 1);
    bytes memory signature = _signOrder(router, order, FRESH_KEY);
    NuluviumRouter.PermitSignature memory permit = _signPermit(address(usdg), address(router), 100e6, FRESH_KEY);

    vm.expectRevert(abi.encodeWithSelector(NuluviumRouter.FeeAboveMax.selector, 1e6 + 1, 1e6));
    router.swap(order, signature, permit, 1e6 + 1);
  }

  function test_minimumOutIsEnforced() public {
    usdg.mint(fresh, 100e6);
    // 100 USDG buys 0.5 tokens; asking for more must fail and leave the owner's USDG untouched.
    vm.expectRevert(MockSwapRouter.TooLittleReceived.selector);
    this.executeExternal(_buyOrder(100e6, 0.5e18 + 1, 0, 1), 0);
    assertEq(usdg.balanceOf(fresh), 100e6);
  }

  function test_mockQuoterMatchesTheMockSwap() public {
    MockQuoterV2 quoter = new MockQuoterV2(swapRouter);
    (uint256 quoted,,,) =
      quoter.quoteExactInputSingle(MockQuoterV2.QuoteExactInputSingleParams(address(usdg), address(stock), 100e6, TIER, 0));
    usdg.mint(fresh, 100e6);
    assertEq(_execute(_buyOrder(100e6, quoted, 0, 1), 0), quoted);
    (uint256 back,,,) =
      quoter.quoteExactInputSingle(MockQuoterV2.QuoteExactInputSingleParams(address(stock), address(usdg), quoted, TIER, 0));
    assertEq(back, 100e6);
    // No pool at another tier: the quote reverts, like QuoterV2.
    vm.expectRevert(MockQuoterV2.NoPool.selector);
    quoter.quoteExactInputSingle(MockQuoterV2.QuoteExactInputSingleParams(address(usdg), address(stock), 100e6, 3000, 0));
  }

  /// @dev Lets expectRevert target the swap call itself rather than the signing helpers.
  function executeExternal(NuluviumRouter.Order memory order, uint256 fee) external returns (uint256) {
    return _execute(order, fee);
  }

  /*////////////////////////////////////////////////////////////// allowlist */

  function test_tokenNotOnAllowlistReverts() public {
    MockStock other = new MockStock();
    usdg.mint(fresh, 100e6);
    NuluviumRouter.Order memory order = _buyOrder(100e6, 0, 0, 1);
    order.tokenOut = address(other);
    bytes memory signature = _signOrder(router, order, FRESH_KEY);
    NuluviumRouter.PermitSignature memory permit = _signPermit(address(usdg), address(router), 100e6, FRESH_KEY);

    vm.expectRevert(abi.encodeWithSelector(NuluviumRouter.TokenNotAllowed.selector, address(other)));
    router.swap(order, signature, permit, 0);
  }

  function test_stockToStockIsRejected() public {
    MockStock other = new MockStock();
    NuluviumRouter.Order memory order = _buyOrder(1e18, 0, 0, 1);
    order.tokenIn = address(other);
    vm.expectRevert(NuluviumRouter.OneSideMustBeUsdg.selector);
    router.swap(order, "", NuluviumRouter.PermitSignature(0, 0, 0, 0), 0);
  }

  function test_onlyOwnerManagesAllowlistAndOnlyExistingPools() public {
    MockStock other = new MockStock();
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
    vm.prank(relayer);
    router.setPoolFee(address(other), TIER);

    vm.startPrank(owner);
    vm.expectRevert(abi.encodeWithSelector(NuluviumRouter.PoolDoesNotExist.selector, address(other), TIER));
    router.setPoolFee(address(other), TIER);
    vm.expectRevert(NuluviumRouter.UsdgCannotBeListed.selector);
    router.setPoolFee(address(usdg), TIER);

    router.setPoolFee(address(stock), 0); // removal needs no pool check
    vm.stopPrank();
    assertEq(router.poolFee(address(stock)), 0);
  }

  function test_pauseStopsSwaps() public {
    usdg.mint(fresh, 100e6);
    vm.prank(owner);
    router.pause();
    NuluviumRouter.Order memory order = _buyOrder(100e6, 0, 0, 1);
    bytes memory signature = _signOrder(router, order, FRESH_KEY);
    NuluviumRouter.PermitSignature memory permit = _signPermit(address(usdg), address(router), 100e6, FRESH_KEY);

    vm.expectRevert(Pausable.EnforcedPause.selector);
    router.swap(order, signature, permit, 0);
  }

  /*////////////////////////////////////////////////////////////// permit front-running */

  function test_frontRunPermitDoesNotBlockTheOrder() public {
    usdg.mint(fresh, 100e6);
    NuluviumRouter.Order memory order = _buyOrder(100e6, 0, 0, 1);
    bytes memory signature = _signOrder(router, order, FRESH_KEY);
    NuluviumRouter.PermitSignature memory permit = _signPermit(address(usdg), address(router), 100e6, FRESH_KEY);

    // Someone submits the permit first; the allowance exists, so the swap still goes through.
    usdg.permit(fresh, address(router), 100e6, permit.deadline, permit.v, permit.r, permit.s);
    vm.prank(relayer);
    router.swap(order, signature, permit, 0);
    assertEq(stock.balanceOf(fresh), 0.5e18);
  }

  /*////////////////////////////////////////////////////////////// relayAndSwap */

  function _withdrawal(address recipient, uint256 amount)
    private
    view
    returns (IPrivacyPool.Withdrawal memory withdrawal, ProofLib.WithdrawProof memory proof)
  {
    withdrawal = IPrivacyPool.Withdrawal({
      processooor: address(entrypoint),
      data: abi.encode(IEntrypoint.RelayData({recipient: recipient, feeRecipient: relayer, relayFeeBPS: 0}))
    });
    proof.pubSignals[0] = amount; // the mock Entrypoint pays this much USDG to the recipient
  }

  function _relayAndSwap(NuluviumRouter.Order memory order, address recipient, uint256 fee) private returns (uint256) {
    (IPrivacyPool.Withdrawal memory withdrawal, ProofLib.WithdrawProof memory proof) = _withdrawal(recipient, order.amountIn);
    bytes memory signature = _signOrder(router, order, FRESH_KEY);
    NuluviumRouter.PermitSignature memory permit = _signPermit(address(usdg), address(router), order.amountIn, FRESH_KEY);
    vm.prank(relayer);
    return router.relayAndSwap(withdrawal, proof, 123, order, signature, permit, fee);
  }

  function relayAndSwapExternal(NuluviumRouter.Order memory order, address recipient, uint256 fee) external returns (uint256) {
    return _relayAndSwap(order, recipient, fee);
  }

  function test_relayAndSwapWithdrawsAndBuysInOneCall() public {
    assertEq(usdg.balanceOf(fresh), 0, "fresh address starts empty");
    uint256 received = _relayAndSwap(_buyOrder(100e6, 0.49e18, 1e6, 1), fresh, 1e6);

    assertEq(entrypoint.relays(), 1);
    assertEq(received, 0.495e18); // 99 USDG after the 1 USDG relayer fee, at 200 per token
    assertEq(stock.balanceOf(fresh), 0.495e18);
    assertEq(usdg.balanceOf(fresh), 0);
    assertEq(usdg.balanceOf(relayer), 1e6);
    _assertRouterEmpty();
  }

  function test_relayAndSwapRequiresWithdrawalToTheOrderOwner() public {
    vm.expectRevert(NuluviumRouter.WithdrawalRecipientIsNotOrderOwner.selector);
    this.relayAndSwapExternal(_buyOrder(100e6, 0, 0, 1), makeAddr("someoneElse"), 0);
  }

  function test_relayAndSwapOnlyBuys() public {
    NuluviumRouter.Order memory order = _buyOrder(1e18, 0, 0, 1);
    order.tokenIn = address(stock);
    order.tokenOut = address(usdg);
    vm.expectRevert(NuluviumRouter.RelayAndSwapOnlyBuys.selector);
    this.relayAndSwapExternal(order, fresh, 0);
  }

  function test_failedSwapUndoesTheWithdrawal() public {
    // Minimum above what 100 USDG buys: the whole call reverts, so no USDG reaches the fresh address.
    vm.expectRevert(MockSwapRouter.TooLittleReceived.selector);
    this.relayAndSwapExternal(_buyOrder(100e6, 0.5e18 + 1, 0, 1), fresh, 0);
    assertEq(usdg.balanceOf(fresh), 0);
    assertEq(entrypoint.relays(), 0);
  }

  /*////////////////////////////////////////////////////////////// fuzz */

  function testFuzz_buyNeverLeavesFundsInRouter(uint256 amountIn, uint256 fee) public {
    amountIn = bound(amountIn, 2, 1_000_000e6);
    fee = bound(fee, 0, amountIn - 1);
    usdg.mint(fresh, amountIn);
    _execute(_buyOrder(amountIn, 0, fee, 1), fee);
    assertEq(usdg.balanceOf(relayer), fee);
    _assertRouterEmpty();
  }

  function _assertRouterEmpty() private view {
    assertEq(usdg.balanceOf(address(router)), 0, "router holds USDG");
    assertEq(stock.balanceOf(address(router)), 0, "router holds stock");
    assertEq(usdg.allowance(address(router), address(swapRouter)), 0, "router left an allowance");
  }
}
