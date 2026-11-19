// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {ForkTest} from "./ForkTest.sol";

import {IEntrypoint} from "interfaces/IEntrypoint.sol";
import {IPrivacyPool} from "interfaces/IPrivacyPool.sol";

import {DeployTestnet} from "../script/DeployTestnet.s.sol";
import {MockUSDG} from "../src/MockUSDG.sol";

/// Runs the testnet deploy script against a fork of Robinhood Chain testnet (CreateX is live there)
/// and checks the result: pool registered for MockUSDG, roles set, and a deposit lands in the tree.
contract DeployTestnetForkTest is ForkTest {
  DeployTestnet private script;
  DeployTestnet.Deployment private deployed;
  address private postman = makeAddr("postman");
  address private depositor = makeAddr("depositor");

  function setUp() public {
    _fork("robinhood_testnet");
    script = new DeployTestnet();
    // CreateX only accepts a salt that starts with the caller's address; the script contract is
    // the caller here, so it is the "deployer" and the owner (owner must call registerPool).
    deployed = script.deploy(address(script), address(script), postman);
  }

  function test_poolIsRegisteredForUsdg() public view {
    (IPrivacyPool pool, uint256 minimumDeposit, uint256 vettingFeeBPS, uint256 maxRelayFeeBPS) =
      IEntrypoint(deployed.entrypoint).assetConfig(IERC20(deployed.usdg));

    assertEq(address(pool), deployed.pool, "pool not registered");
    assertEq(minimumDeposit, 1e6, "minimum deposit");
    assertEq(vettingFeeBPS, 0, "vetting fee");
    assertEq(maxRelayFeeBPS, 100, "max relay fee");
    assertEq(IPrivacyPool(deployed.pool).ASSET(), deployed.usdg, "pool asset");
    assertEq(IPrivacyPool(deployed.pool).SCOPE(), deployed.scope, "scope");
  }

  function test_rolesAreSet() public view {
    IEntrypoint entrypoint = IEntrypoint(deployed.entrypoint);
    assertTrue(_hasRole(entrypoint, keccak256("OWNER_ROLE"), address(script)), "owner");
    assertTrue(_hasRole(entrypoint, keccak256("ASP_POSTMAN"), postman), "postman");
    assertFalse(_hasRole(entrypoint, keccak256("ASP_POSTMAN"), depositor), "stranger is postman");
  }

  function test_depositLandsInTree() public {
    uint256 amount = 25e6; // 25 USDG
    MockUSDG(deployed.usdg).mint(depositor, amount);

    vm.startPrank(depositor);
    IERC20(deployed.usdg).approve(deployed.entrypoint, amount);
    // Any field element works as a precommitment here; real ones come from the SDK (secret hash).
    uint256 commitment = IEntrypoint(deployed.entrypoint).deposit(IERC20(deployed.usdg), amount, 12_345);
    vm.stopPrank();

    assertGt(commitment, 0, "no commitment");
    assertEq(IPrivacyPool(deployed.pool).currentTreeSize(), 1, "tree size");
    // With no vetting fee the full amount sits in the pool.
    assertEq(IERC20(deployed.usdg).balanceOf(deployed.pool), amount, "pool balance");
    assertEq(IERC20(deployed.usdg).balanceOf(depositor), 0, "depositor balance");
  }

  function test_depositBelowMinimumReverts() public {
    MockUSDG(deployed.usdg).mint(depositor, 1e6);
    vm.startPrank(depositor);
    IERC20(deployed.usdg).approve(deployed.entrypoint, 1e6);
    vm.expectRevert(IEntrypoint.MinimumDepositAmount.selector);
    IEntrypoint(deployed.entrypoint).deposit(IERC20(deployed.usdg), 0.5e6, 12_345);
    vm.stopPrank();
  }

  function test_mockUsdgCapsMint() public {
    vm.expectRevert(MockUSDG.MintTooLarge.selector);
    MockUSDG(deployed.usdg).mint(depositor, 1_000_001e6);
  }

  function _hasRole(IEntrypoint entrypoint, bytes32 role, address account) private view returns (bool) {
    (bool ok, bytes memory data) =
      address(entrypoint).staticcall(abi.encodeWithSignature("hasRole(bytes32,address)", role, account));
    return ok && abi.decode(data, (bool));
  }

}
