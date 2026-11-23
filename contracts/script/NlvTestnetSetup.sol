// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Ownable2Step} from "@oz/access/Ownable2Step.sol";
import {CommonBase} from "forge-std/Base.sol";

import {IEntrypoint} from "interfaces/IEntrypoint.sol";

import {ISwapRouter02} from "../src/NuluviumRouter.sol";
import {IRelayerRegistry, NuluviumRouterV2} from "../src/NuluviumRouterV2.sol";
import {RelayerRegistry} from "../src/RelayerRegistry.sol";
import {TestNLV} from "../src/TestNLV.sol";

/// @title NlvTestnetSetup
/// @notice Shared by the deploy script, the Safe batch script and the testnet fork test, so the test
///         checks exactly what the scripts do.
abstract contract NlvTestnetSetup is CommonBase {
  /// @notice Safe 2-of-2 that owns the Router v1 and the Entrypoint; owner and treasury of the new contracts.
  address internal constant SAFE = 0xDe29697FB1c56422A23DCFb8b9e8689c0A0bfCB5;
  /// @notice Smallest relayer bond: one TestNLV claim.
  uint256 internal constant MIN_BOND = 1000e18;
  uint24 internal constant MSTK_TIER = 500;

  struct Existing {
    address usdg;
    address entrypoint;
    address mockSwapRouter;
    address mockStock;
  }

  struct NlvDeployment {
    TestNLV token;
    RelayerRegistry registry;
    NuluviumRouterV2 router;
  }

  /// @notice One call of the Safe batch.
  struct SafeCall {
    address to;
    bytes data;
    string decoded;
  }

  /// @dev Addresses already live on testnet (deployments/46630.json and 46630-router.json).
  function _existing() internal view returns (Existing memory existing) {
    string memory pools = vm.readFile("deployments/46630.json");
    string memory routerV1 = vm.readFile("deployments/46630-router.json");
    existing.usdg = vm.parseJsonAddress(pools, ".usdg");
    existing.entrypoint = vm.parseJsonAddress(pools, ".entrypoint");
    existing.mockSwapRouter = vm.parseJsonAddress(routerV1, ".mockSwapRouter");
    existing.mockStock = vm.parseJsonAddress(routerV1, ".mockStock");
  }

  /// @dev Deploys tNLV, the registry and Router v2 with `deployer` as first owner, then starts the
  ///      two-step hand-over to the Safe. The deployer sets nothing else: the allowlist comes from the Safe.
  ///      Must run with msg.sender = `deployer` (broadcast or prank).
  function _deployNlv(Existing memory existing, address deployer) internal returns (NlvDeployment memory deployed) {
    deployed.token = new TestNLV();
    deployed.registry = new RelayerRegistry(IERC20(address(deployed.token)), MIN_BOND, deployer);
    deployed.router = new NuluviumRouterV2(
      IERC20(existing.usdg),
      ISwapRouter02(existing.mockSwapRouter),
      IEntrypoint(existing.entrypoint),
      IRelayerRegistry(address(deployed.registry)),
      SAFE,
      deployer
    );
    deployed.registry.transferOwnership(SAFE);
    deployed.router.transferOwnership(SAFE);
  }

  /// @dev What the Safe signs: take ownership of both contracts and list MSTK on Router v2.
  function _safeCalls(NlvDeployment memory deployed, address mockStock) internal pure returns (SafeCall[] memory calls) {
    calls = new SafeCall[](3);
    calls[0] = SafeCall(address(deployed.registry), abi.encodeCall(Ownable2Step.acceptOwnership, ()), "RelayerRegistry.acceptOwnership()");
    calls[1] = SafeCall(address(deployed.router), abi.encodeCall(Ownable2Step.acceptOwnership, ()), "NuluviumRouterV2.acceptOwnership()");
    calls[2] = SafeCall(
      address(deployed.router),
      abi.encodeCall(NuluviumRouterV2.setPoolFee, (mockStock, MSTK_TIER)),
      "NuluviumRouterV2.setPoolFee(MSTK, 500)"
    );
  }

  /// @dev Runs each call in order with msg.sender = the Safe (as MultiSendCallOnly does) and checks the
  ///      end state. Reverts on the first failing call.
  function _simulateAsSafe(SafeCall[] memory calls, NlvDeployment memory deployed, address mockStock) internal {
    for (uint256 i = 0; i < calls.length; ++i) {
      vm.prank(SAFE);
      (bool ok, bytes memory result) = calls[i].to.call(calls[i].data);
      if (!ok) {
        assembly {
          revert(add(result, 32), mload(result))
        }
      }
    }
    require(deployed.registry.owner() == SAFE && deployed.registry.pendingOwner() == address(0), "registry owner");
    require(deployed.router.owner() == SAFE && deployed.router.pendingOwner() == address(0), "router owner");
    require(deployed.router.poolFee(mockStock) == MSTK_TIER, "MSTK not listed");
  }
}
