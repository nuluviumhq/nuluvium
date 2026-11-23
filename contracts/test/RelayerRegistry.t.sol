// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

import {RelayerRegistry} from "../src/RelayerRegistry.sol";
import {TestNLV} from "../src/TestNLV.sol";

contract TestNLVTest is Test {
  TestNLV private token;
  address private alice = makeAddr("alice");

  function setUp() public {
    token = new TestNLV();
    vm.warp(1_800_000_000);
  }

  function test_metadataAndNoPremint() public view {
    assertEq(token.name(), "Test NLV");
    assertEq(token.symbol(), "tNLV");
    assertEq(token.decimals(), 18);
    assertEq(token.totalSupply(), 0);
  }

  function test_claimMintsOnceADay() public {
    vm.prank(alice);
    token.claim();
    assertEq(token.balanceOf(alice), 1000e18);

    vm.expectRevert(abi.encodeWithSelector(TestNLV.ClaimTooSoon.selector, block.timestamp + 1 days));
    vm.prank(alice);
    token.claim();

    vm.warp(block.timestamp + 1 days);
    vm.prank(alice);
    token.claim();
    assertEq(token.balanceOf(alice), 2000e18);
    assertEq(token.totalSupply(), 2000e18);
  }
}

contract RelayerRegistryTest is Test {
  uint256 private constant MIN_BOND = 1000e18;
  string private constant URL_1 = "https://relayer.example";

  TestNLV private token;
  RelayerRegistry private registry;
  address private safe = makeAddr("safe");
  address private relayer1 = makeAddr("relayer1");
  address private relayer2 = makeAddr("relayer2");
  address private relayer3 = makeAddr("relayer3");

  function setUp() public {
    vm.warp(1_800_000_000);
    token = new TestNLV();
    registry = new RelayerRegistry(IERC20(address(token)), MIN_BOND, safe);
  }

  /// Claims from the faucet path (twice when `amount` needs it) and registers.
  function _register(address relayer, string memory url, uint256 amount) private {
    vm.startPrank(relayer);
    while (token.balanceOf(relayer) < amount) {
      token.claim();
      vm.warp(block.timestamp + 1 days);
    }
    token.approve(address(registry), amount);
    registry.register(url, amount);
    vm.stopPrank();
  }

  function test_registerBondsAndListsTheRelayer() public {
    _register(relayer1, URL_1, MIN_BOND);

    assertTrue(registry.isActive(relayer1));
    assertEq(token.balanceOf(address(registry)), MIN_BOND);
    assertEq(token.balanceOf(relayer1), 0);
    RelayerRegistry.RelayerInfo[] memory list = registry.activeRelayers();
    assertEq(list.length, 1);
    assertEq(list[0].relayer, relayer1);
    assertEq(list[0].url, URL_1);
    assertEq(list[0].bond, MIN_BOND);
  }

  function test_registerRejectsSmallBondBadUrlAndDoubleRegistration() public {
    vm.startPrank(relayer1);
    token.claim();
    token.approve(address(registry), type(uint256).max);
    vm.expectRevert(abi.encodeWithSelector(RelayerRegistry.BondTooSmall.selector, MIN_BOND - 1, MIN_BOND));
    registry.register(URL_1, MIN_BOND - 1);
    vm.expectRevert(RelayerRegistry.InvalidUrl.selector);
    registry.register("", MIN_BOND);
    vm.expectRevert(RelayerRegistry.InvalidUrl.selector);
    registry.register(string(new bytes(201)), MIN_BOND);

    registry.register(URL_1, MIN_BOND);
    vm.expectRevert(RelayerRegistry.AlreadyRegistered.selector);
    registry.register(URL_1, MIN_BOND);
    vm.stopPrank();
  }

  function test_addBondAndSetUrl() public {
    _register(relayer1, URL_1, MIN_BOND);
    vm.warp(block.timestamp + 1 days);
    vm.startPrank(relayer1);
    token.claim();
    token.approve(address(registry), 500e18);
    registry.addBond(500e18);
    registry.setUrl("https://relayer2.example");
    vm.stopPrank();

    RelayerRegistry.Relayer memory record = registry.relayerOf(relayer1);
    assertEq(record.bond, 1500e18);
    assertEq(record.url, "https://relayer2.example");
  }

  function test_unbondStopsAtOnceAndPaysAfterTheDelay() public {
    _register(relayer1, URL_1, MIN_BOND);
    vm.prank(relayer1);
    registry.requestUnbond();

    assertFalse(registry.isActive(relayer1));
    assertEq(registry.activeCount(), 0);
    uint256 availableAt = block.timestamp + 7 days;
    assertEq(registry.relayerOf(relayer1).unbondAvailableAt, availableAt);

    vm.warp(availableAt - 1);
    vm.expectRevert(abi.encodeWithSelector(RelayerRegistry.UnbondNotReady.selector, availableAt));
    vm.prank(relayer1);
    registry.withdraw();

    // A leaving relayer cannot top up, change its URL or register again before it withdraws.
    vm.startPrank(relayer1);
    vm.expectRevert(RelayerRegistry.NotActive.selector);
    registry.addBond(1);
    vm.expectRevert(RelayerRegistry.NotActive.selector);
    registry.setUrl(URL_1);
    vm.expectRevert(RelayerRegistry.AlreadyRegistered.selector);
    registry.register(URL_1, MIN_BOND);
    vm.stopPrank();

    vm.warp(availableAt);
    vm.prank(relayer1);
    registry.withdraw();
    assertEq(token.balanceOf(relayer1), MIN_BOND);
    assertEq(token.balanceOf(address(registry)), 0);
    assertEq(registry.relayerOf(relayer1).unbondAvailableAt, 0);

    // After withdrawing it may register again.
    _register(relayer1, URL_1, MIN_BOND);
    assertTrue(registry.isActive(relayer1));
  }

  function test_withdrawWithoutUnbondReverts() public {
    _register(relayer1, URL_1, MIN_BOND);
    vm.expectRevert(RelayerRegistry.NotLeaving.selector);
    vm.prank(relayer1);
    registry.withdraw();
  }

  function test_safeSlashesToItselfAndRemovesBelowMinimum() public {
    _register(relayer1, URL_1, 2000e18);

    vm.prank(safe);
    registry.slash(relayer1, 1000e18, "test: wrong fee");
    assertEq(token.balanceOf(safe), 1000e18);
    assertTrue(registry.isActive(relayer1), "still at the minimum");

    vm.prank(safe);
    registry.slash(relayer1, 1, "test: below minimum");
    assertFalse(registry.isActive(relayer1));
    assertEq(registry.relayerOf(relayer1).unbondAvailableAt, block.timestamp + 7 days);

    // Still slashable while waiting to withdraw.
    vm.prank(safe);
    registry.slash(relayer1, 999e18, "test: during unbond");
    vm.expectRevert(abi.encodeWithSelector(RelayerRegistry.SlashAboveBond.selector, 1e18, 1e18 - 1));
    vm.prank(safe);
    registry.slash(relayer1, 1e18, "test: too much");

    vm.warp(block.timestamp + 7 days);
    vm.prank(relayer1);
    registry.withdraw();
    assertEq(token.balanceOf(relayer1), 1e18 - 1);
    assertEq(token.balanceOf(safe), 2000e18 - (1e18 - 1));
  }

  function test_safeRemovesARelayer() public {
    _register(relayer1, URL_1, MIN_BOND);
    vm.prank(safe);
    registry.remove(relayer1, "test: down for a week");
    assertFalse(registry.isActive(relayer1));
    assertEq(registry.relayerOf(relayer1).bond, MIN_BOND, "removal alone takes nothing");

    vm.expectRevert(RelayerRegistry.NotActive.selector);
    vm.prank(safe);
    registry.remove(relayer1, "again");
  }

  function test_onlyOwnerSlashesAndRemoves() public {
    _register(relayer1, URL_1, MIN_BOND);
    vm.startPrank(relayer2);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer2));
    registry.slash(relayer1, 1, "");
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer2));
    registry.remove(relayer1, "");
    vm.stopPrank();
  }

  function test_activeListStaysCorrectWhenTheMiddleOneLeaves() public {
    _register(relayer1, "https://one.example", MIN_BOND);
    _register(relayer2, "https://two.example", MIN_BOND);
    _register(relayer3, "https://three.example", 2000e18);

    vm.prank(relayer1);
    registry.requestUnbond();

    RelayerRegistry.RelayerInfo[] memory list = registry.activeRelayers();
    assertEq(list.length, 2);
    assertEq(list[0].relayer, relayer3); // moved into the freed slot
    assertEq(list[0].url, "https://three.example");
    assertEq(list[0].bond, 2000e18);
    assertEq(list[1].relayer, relayer2);

    vm.prank(safe);
    registry.remove(relayer2, "test");
    list = registry.activeRelayers();
    assertEq(list.length, 1);
    assertEq(list[0].relayer, relayer3);
  }

  function testFuzz_bondsAreConserved(uint256 slashAmount) public {
    _register(relayer1, URL_1, 3000e18);
    _register(relayer2, URL_1, MIN_BOND);
    slashAmount = bound(slashAmount, 1, 3000e18);
    vm.prank(safe);
    registry.slash(relayer1, slashAmount, "fuzz");
    assertEq(
      token.balanceOf(address(registry)),
      registry.relayerOf(relayer1).bond + registry.relayerOf(relayer2).bond,
      "registry holds exactly the bonds"
    );
    assertEq(registry.isActive(relayer1), 3000e18 - slashAmount >= MIN_BOND);
  }
}
