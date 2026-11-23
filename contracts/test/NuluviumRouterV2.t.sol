// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Pausable} from "@oz/utils/Pausable.sol";
import {Test} from "forge-std/Test.sol";

import {MockUSDG} from "../src/MockUSDG.sol";
import {ISwapRouter02} from "../src/NuluviumRouter.sol";
import {IRelayerRegistry, NuluviumRouterV2} from "../src/NuluviumRouterV2.sol";
import {RelayerRegistry} from "../src/RelayerRegistry.sol";
import {TestNLV} from "../src/TestNLV.sol";
import {ProofLib} from "contracts/lib/ProofLib.sol";
import {IEntrypoint} from "interfaces/IEntrypoint.sol";
import {IPrivacyPool} from "interfaces/IPrivacyPool.sol";

import {MockEntrypoint, MockFactory, MockStock, MockSwapRouter} from "./mocks/RouterMocks.sol";
import {IPermitNonces} from "./NuluviumRouter.t.sol";

/// Signing helpers for Router v2 tests (also used by the v2 fork tests).
abstract contract RouterV2Signing is Test {
  bytes32 internal constant PERMIT_TYPEHASH_V2 =
    keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

  function _signOrderV2(NuluviumRouterV2 router, NuluviumRouterV2.Order memory order, uint256 key)
    internal
    view
    returns (bytes memory)
  {
    bytes32 structHash = keccak256(abi.encode(router.ORDER_TYPEHASH(), order));
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", router.DOMAIN_SEPARATOR(), structHash));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
    return abi.encodePacked(r, s, v);
  }

  function _signPermitV2(address token, address spender, uint256 value, uint256 key)
    internal
    view
    returns (NuluviumRouterV2.PermitSignature memory permit)
  {
    address owner = vm.addr(key);
    permit.deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(PERMIT_TYPEHASH_V2, owner, spender, value, IPermitNonces(token).nonces(owner), permit.deadline)
    );
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", IPermitNonces(token).DOMAIN_SEPARATOR(), structHash));
    (permit.v, permit.r, permit.s) = vm.sign(key, digest);
  }

  /// Claims tNLV and registers `relayer` with the minimum bond.
  function _registerRelayer(TestNLV token, RelayerRegistry registry, address relayer, string memory url) internal {
    vm.startPrank(relayer);
    token.claim();
    token.approve(address(registry), registry.MIN_BOND());
    registry.register(url, registry.MIN_BOND());
    vm.stopPrank();
  }
}

contract NuluviumRouterV2Test is RouterV2Signing {
  uint24 private constant TIER = 500;
  uint256 private constant FRESH_KEY = 0xF8E5;

  MockUSDG private usdg;
  MockStock private stock;
  MockFactory private factory;
  MockSwapRouter private swapRouter;
  MockEntrypoint private entrypoint;
  TestNLV private nlv;
  RelayerRegistry private registry;
  NuluviumRouterV2 private router;

  address private owner = makeAddr("owner");
  address private treasury = makeAddr("treasury");
  address private relayer = makeAddr("relayer");
  address private fresh;

  function setUp() public {
    vm.warp(1_800_000_000);
    usdg = new MockUSDG();
    stock = new MockStock();
    factory = new MockFactory();
    swapRouter = new MockSwapRouter(address(factory), address(usdg), 200e6); // 1 stock = 200 USDG
    factory.setPool(address(usdg), address(stock), TIER, makeAddr("pool"));
    entrypoint = new MockEntrypoint(address(usdg));
    nlv = new TestNLV();
    registry = new RelayerRegistry(IERC20(address(nlv)), 1000e18, owner);
    router = new NuluviumRouterV2(
      IERC20(address(usdg)),
      ISwapRouter02(address(swapRouter)),
      IEntrypoint(address(entrypoint)),
      IRelayerRegistry(address(registry)),
      treasury,
      owner
    );
    vm.prank(owner);
    router.setPoolFee(address(stock), TIER);
    _registerRelayer(nlv, registry, relayer, "https://relayer.example");
    fresh = vm.addr(FRESH_KEY);
  }

  function _buyOrder(uint256 amountIn, uint256 minOut, uint256 maxFee, uint256 nonce)
    private
    view
    returns (NuluviumRouterV2.Order memory)
  {
    return NuluviumRouterV2.Order({
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

  function _sellOrder(uint256 amountIn, uint256 minOut, uint256 maxFee, uint256 nonce)
    private
    view
    returns (NuluviumRouterV2.Order memory order)
  {
    order = _buyOrder(amountIn, minOut, maxFee, nonce);
    order.tokenIn = address(stock);
    order.tokenOut = address(usdg);
  }

  function _executeAs(address sender, NuluviumRouterV2.Order memory order, uint256 fee) private returns (uint256) {
    bytes memory signature = _signOrderV2(router, order, FRESH_KEY);
    NuluviumRouterV2.PermitSignature memory permit =
      _signPermitV2(order.tokenIn, address(router), order.amountIn, FRESH_KEY);
    vm.prank(sender);
    return router.swap(order, signature, permit, fee);
  }

  function _execute(NuluviumRouterV2.Order memory order, uint256 fee) private returns (uint256) {
    return _executeAs(relayer, order, fee);
  }

  /// @dev Lets expectRevert target the swap call itself rather than the signing helpers.
  function executeAsExternal(address sender, NuluviumRouterV2.Order memory order, uint256 fee) external returns (uint256) {
    return _executeAs(sender, order, fee);
  }

  /*////////////////////////////////////////////////////////////// protocol fee */

  function test_buyPaysGasFeeAndSplitsTheProtocolFee() public {
    usdg.mint(fresh, 100e6);
    uint256 received = _execute(_buyOrder(100e6, 0.49e18, 0.1e6, 1), 0.1e6);

    // 0.1% of 100 USDG = 0.1 USDG protocol fee: 0.05 to the relayer, 0.05 to the treasury.
    // Swapped: 100 - 0.1 gas fee - 0.1 protocol fee = 99.8 USDG at 200 per token = 0.499 tokens.
    assertEq(received, 0.499e18);
    assertEq(stock.balanceOf(fresh), 0.499e18);
    assertEq(usdg.balanceOf(relayer), 0.15e6);
    assertEq(usdg.balanceOf(treasury), 0.05e6);
    assertEq(usdg.balanceOf(fresh), 0);
    _assertRouterEmpty();
  }

  function test_sellTakesTheProtocolFeeFromTheUsdgReceived() public {
    stock.mint(fresh, 1e18);
    uint256 received = _execute(_sellOrder(1e18, 199e6, 0.1e6, 7), 0.1e6);

    // 200 USDG out of the pool; 0.1 gas fee; protocol fee 0.2 (0.1 relayer, 0.1 treasury).
    assertEq(received, 199.7e6);
    assertEq(usdg.balanceOf(fresh), 199.7e6);
    assertEq(usdg.balanceOf(relayer), 0.2e6);
    assertEq(usdg.balanceOf(treasury), 0.1e6);
    _assertRouterEmpty();
  }

  function test_sellMinimumCountsTheProtocolFee() public {
    stock.mint(fresh, 1e18);
    // 199.7 is the most the owner can net; asking for 199.75 passes Uniswap's bound but not ours.
    vm.expectRevert(abi.encodeWithSelector(NuluviumRouterV2.TooLittleReceived.selector, 199.7e6, 199.75e6));
    this.executeAsExternal(relayer, _sellOrder(1e18, 199.75e6, 0.1e6, 7), 0.1e6);
    assertEq(stock.balanceOf(fresh), 1e18);
  }

  function test_protocolFeeRoundsDownAndOddUnitGoesToTreasury() public {
    usdg.mint(fresh, 1.003e6);
    _execute(_buyOrder(1.003e6, 0, 0, 1), 0);
    // 0.1% of 1,003,000 units = 1,003 units: relayer 501, treasury 502.
    assertEq(router.protocolFeeFor(1.003e6), 1003);
    assertEq(usdg.balanceOf(relayer), 501);
    assertEq(usdg.balanceOf(treasury), 502);
  }

  function test_feesMustStayBelowTheAmountIn() public {
    usdg.mint(fresh, 1000);
    // 1,000 units: protocol fee 1 unit; a gas fee of 999 leaves nothing to swap.
    vm.expectRevert(NuluviumRouterV2.FeeNotBelowAmount.selector);
    this.executeAsExternal(relayer, _buyOrder(1000, 0, 999, 1), 999);
  }

  /*////////////////////////////////////////////////////////////// registered relayers only */

  function test_unregisteredSenderIsRefused() public {
    usdg.mint(fresh, 100e6);
    address stranger = makeAddr("stranger");
    vm.expectRevert(abi.encodeWithSelector(NuluviumRouterV2.NotARegisteredRelayer.selector, stranger));
    this.executeAsExternal(stranger, _buyOrder(100e6, 0, 0, 1), 0);
  }

  function test_relayerThatIsLeavingOrRemovedIsRefused() public {
    usdg.mint(fresh, 100e6);
    vm.prank(relayer);
    registry.requestUnbond();
    vm.expectRevert(abi.encodeWithSelector(NuluviumRouterV2.NotARegisteredRelayer.selector, relayer));
    this.executeAsExternal(relayer, _buyOrder(100e6, 0, 0, 1), 0);

    address second = makeAddr("second");
    _registerRelayer(nlv, registry, second, "https://second.example");
    _executeAs(second, _buyOrder(50e6, 0, 0, 2), 0);

    vm.prank(owner);
    registry.remove(second, "test");
    vm.expectRevert(abi.encodeWithSelector(NuluviumRouterV2.NotARegisteredRelayer.selector, second));
    this.executeAsExternal(second, _buyOrder(50e6, 0, 0, 3), 0);
  }

  function test_relayAndSwapAlsoNeedsARegisteredRelayer() public {
    address stranger = makeAddr("stranger");
    vm.expectRevert(abi.encodeWithSelector(NuluviumRouterV2.NotARegisteredRelayer.selector, stranger));
    this.relayAndSwapAsExternal(stranger, _buyOrder(100e6, 0, 0, 1), fresh, 0);
  }

  /*////////////////////////////////////////////////////////////// v1 behaviour kept */

  function test_v1SignatureDomainDoesNotWorkHere() public {
    // Same struct, but the domain says version "2": a signature over version "1" fails.
    usdg.mint(fresh, 100e6);
    NuluviumRouterV2.Order memory order = _buyOrder(100e6, 0, 0, 1);
    bytes32 v1Domain = keccak256(
      abi.encode(
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
        keccak256("Nuluvium Router"),
        keccak256("1"),
        block.chainid,
        address(router)
      )
    );
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", v1Domain, keccak256(abi.encode(router.ORDER_TYPEHASH(), order))));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(FRESH_KEY, digest);
    NuluviumRouterV2.PermitSignature memory permit = _signPermitV2(address(usdg), address(router), 100e6, FRESH_KEY);
    vm.expectRevert(NuluviumRouterV2.InvalidSignature.selector);
    vm.prank(relayer);
    router.swap(order, abi.encodePacked(r, s, v), permit, 0);
  }

  function test_relayerCannotChangeSignedTerms() public {
    usdg.mint(fresh, 100e6);
    NuluviumRouterV2.Order memory order = _buyOrder(100e6, 0.49e18, 0, 1);
    bytes memory signature = _signOrderV2(router, order, FRESH_KEY);
    NuluviumRouterV2.PermitSignature memory permit = _signPermitV2(address(usdg), address(router), 100e6, FRESH_KEY);
    order.minAmountOut = 0;
    vm.expectRevert(NuluviumRouterV2.InvalidSignature.selector);
    vm.prank(relayer);
    router.swap(order, signature, permit, 0);
  }

  function test_replayDeadlineAndMaxFee() public {
    usdg.mint(fresh, 300e6);
    _execute(_buyOrder(100e6, 0, 0, 42), 0);
    vm.expectRevert(NuluviumRouterV2.NonceAlreadyUsed.selector);
    this.executeAsExternal(relayer, _buyOrder(100e6, 0, 0, 42), 0);

    vm.expectRevert(abi.encodeWithSelector(NuluviumRouterV2.FeeAboveMax.selector, 1e6 + 1, 1e6));
    this.executeAsExternal(relayer, _buyOrder(100e6, 0, 1e6, 43), 1e6 + 1);

    NuluviumRouterV2.Order memory late = _buyOrder(100e6, 0, 0, 44);
    late.deadline = block.timestamp - 1;
    vm.expectRevert(NuluviumRouterV2.OrderExpired.selector);
    this.executeAsExternal(relayer, late, 0);
  }

  function test_buyMinimumIsEnforced() public {
    usdg.mint(fresh, 100e6);
    // 100 USDG nets 99.9 after the protocol fee = 0.4995 tokens; one unit more must fail.
    vm.expectRevert(MockSwapRouter.TooLittleReceived.selector);
    this.executeAsExternal(relayer, _buyOrder(100e6, 0.4995e18 + 1, 0, 1), 0);
    assertEq(usdg.balanceOf(fresh), 100e6);
  }

  function test_allowlistOwnerOnlyAndPause() public {
    MockStock other = new MockStock();
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
    vm.prank(relayer);
    router.setPoolFee(address(other), TIER);

    vm.startPrank(owner);
    vm.expectRevert(abi.encodeWithSelector(NuluviumRouterV2.PoolDoesNotExist.selector, address(other), TIER));
    router.setPoolFee(address(other), TIER);
    vm.expectRevert(NuluviumRouterV2.UsdgCannotBeListed.selector);
    router.setPoolFee(address(usdg), TIER);
    router.pause();
    vm.stopPrank();

    usdg.mint(fresh, 100e6);
    vm.expectRevert(Pausable.EnforcedPause.selector);
    this.executeAsExternal(relayer, _buyOrder(100e6, 0, 0, 1), 0);

    NuluviumRouterV2.Order memory order = _buyOrder(100e6, 0, 0, 2);
    order.tokenOut = address(other);
    vm.prank(owner);
    router.unpause();
    vm.expectRevert(abi.encodeWithSelector(NuluviumRouterV2.TokenNotAllowed.selector, address(other)));
    this.executeAsExternal(relayer, order, 0);
  }

  function test_stockToStockIsRejected() public {
    NuluviumRouterV2.Order memory order = _buyOrder(1e18, 0, 0, 1);
    order.tokenIn = address(new MockStock());
    vm.expectRevert(NuluviumRouterV2.OneSideMustBeUsdg.selector);
    vm.prank(relayer);
    router.swap(order, "", NuluviumRouterV2.PermitSignature(0, 0, 0, 0), 0);
  }

  function test_frontRunPermitDoesNotBlockTheOrder() public {
    usdg.mint(fresh, 100e6);
    NuluviumRouterV2.Order memory order = _buyOrder(100e6, 0, 0, 1);
    bytes memory signature = _signOrderV2(router, order, FRESH_KEY);
    NuluviumRouterV2.PermitSignature memory permit = _signPermitV2(address(usdg), address(router), 100e6, FRESH_KEY);
    usdg.permit(fresh, address(router), 100e6, permit.deadline, permit.v, permit.r, permit.s);
    vm.prank(relayer);
    router.swap(order, signature, permit, 0);
    assertEq(stock.balanceOf(fresh), 0.4995e18);
  }

  function test_constructorRejectsZeroRegistryOrTreasury() public {
    vm.expectRevert(NuluviumRouterV2.ZeroAddress.selector);
    new NuluviumRouterV2(
      IERC20(address(usdg)), ISwapRouter02(address(swapRouter)), IEntrypoint(address(entrypoint)), IRelayerRegistry(address(0)), treasury, owner
    );
    vm.expectRevert(NuluviumRouterV2.ZeroAddress.selector);
    new NuluviumRouterV2(
      IERC20(address(usdg)), ISwapRouter02(address(swapRouter)), IEntrypoint(address(entrypoint)), IRelayerRegistry(address(registry)), address(0), owner
    );
  }

  /*////////////////////////////////////////////////////////////// relayAndSwap */

  function _relayAndSwapAs(address sender, NuluviumRouterV2.Order memory order, address recipient, uint256 fee)
    private
    returns (uint256)
  {
    IPrivacyPool.Withdrawal memory withdrawal = IPrivacyPool.Withdrawal({
      processooor: address(entrypoint),
      data: abi.encode(IEntrypoint.RelayData({recipient: recipient, feeRecipient: sender, relayFeeBPS: 0}))
    });
    ProofLib.WithdrawProof memory proof;
    proof.pubSignals[0] = order.amountIn; // the mock Entrypoint pays this much USDG to the recipient
    bytes memory signature = _signOrderV2(router, order, FRESH_KEY);
    NuluviumRouterV2.PermitSignature memory permit = _signPermitV2(address(usdg), address(router), order.amountIn, FRESH_KEY);
    vm.prank(sender);
    return router.relayAndSwap(withdrawal, proof, 123, order, signature, permit, fee);
  }

  function relayAndSwapAsExternal(address sender, NuluviumRouterV2.Order memory order, address recipient, uint256 fee)
    external
    returns (uint256)
  {
    return _relayAndSwapAs(sender, order, recipient, fee);
  }

  function test_relayAndSwapWithdrawsBuysAndSplitsFees() public {
    uint256 received = _relayAndSwapAs(relayer, _buyOrder(100e6, 0.49e18, 0.1e6, 1), fresh, 0.1e6);
    assertEq(entrypoint.relays(), 1);
    assertEq(received, 0.499e18);
    assertEq(usdg.balanceOf(fresh), 0);
    assertEq(usdg.balanceOf(relayer), 0.15e6);
    assertEq(usdg.balanceOf(treasury), 0.05e6);
    _assertRouterEmpty();
  }

  function test_relayAndSwapChecksRecipientAndDirection() public {
    vm.expectRevert(NuluviumRouterV2.WithdrawalRecipientIsNotOrderOwner.selector);
    this.relayAndSwapAsExternal(relayer, _buyOrder(100e6, 0, 0, 1), makeAddr("someoneElse"), 0);

    vm.expectRevert(NuluviumRouterV2.RelayAndSwapOnlyBuys.selector);
    this.relayAndSwapAsExternal(relayer, _sellOrder(1e18, 0, 0, 2), fresh, 0);
  }

  function test_failedSwapUndoesTheWithdrawal() public {
    vm.expectRevert(MockSwapRouter.TooLittleReceived.selector);
    this.relayAndSwapAsExternal(relayer, _buyOrder(100e6, 0.5e18, 0, 1), fresh, 0);
    assertEq(usdg.balanceOf(fresh), 0);
    assertEq(entrypoint.relays(), 0);
  }

  /*////////////////////////////////////////////////////////////// fuzz */

  function testFuzz_buyConservesUsdgAndLeavesRouterEmpty(uint256 amountIn, uint256 fee) public {
    amountIn = bound(amountIn, 2, 1_000_000e6);
    uint256 protocolFee = router.protocolFeeFor(amountIn);
    vm.assume(protocolFee + 1 < amountIn);
    fee = bound(fee, 0, amountIn - protocolFee - 1);
    usdg.mint(fresh, amountIn);
    _execute(_buyOrder(amountIn, 0, fee, 1), fee);

    uint256 swapped = amountIn - fee - protocolFee;
    assertEq(usdg.balanceOf(relayer) + usdg.balanceOf(treasury), fee + protocolFee, "fees add up");
    assertEq(usdg.balanceOf(treasury), protocolFee - protocolFee / 2);
    assertEq(stock.balanceOf(fresh), (swapped * 1e18) / 200e6);
    _assertRouterEmpty();
  }

  function testFuzz_sellOwnerGetsAtLeastTheMinimum(uint256 amountIn, uint256 fee) public {
    amountIn = bound(amountIn, 1e12, 4000e18); // MockUSDG mints at most 1,000,000 per call
    uint256 gross = (amountIn * 200e6) / 1e18;
    fee = bound(fee, 0, gross / 2);
    uint256 net = gross - fee - router.protocolFeeFor(gross);
    stock.mint(fresh, amountIn);
    uint256 received = _execute(_sellOrder(amountIn, net, fee, 1), fee);
    assertEq(received, net);
    assertEq(usdg.balanceOf(fresh), net);
    _assertRouterEmpty();
  }

  function _assertRouterEmpty() private view {
    assertEq(usdg.balanceOf(address(router)), 0, "router holds USDG");
    assertEq(stock.balanceOf(address(router)), 0, "router holds stock");
    assertEq(usdg.allowance(address(router), address(swapRouter)), 0, "router left an allowance");
  }
}
