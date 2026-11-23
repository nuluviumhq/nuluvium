// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {console} from "forge-std/console.sol";

import {NlvTestnetSetup} from "./NlvTestnetSetup.sol";

/// @title DeployNlvTestnet
/// @notice Deploys the relayer model on testnet: TestNLV (tNLV), RelayerRegistry and NuluviumRouterV2
///         (same tUSDG, Entrypoint and mock swap router as Router v1, which stays as it is). Both owned
///         contracts are handed to the Safe in two steps: this script calls transferOwnership, and the
///         Safe batch (NlvSafeBatchTestnet.s.sol) accepts and lists MSTK.
///
///      Dry run (no transactions, from contracts/, after loading ../.dev.vars):
///        forge script script/DeployNlvTestnet.s.sol --rpc-url $TESTNET_RPC_URL --sender <deployer>
///      Deploy:
///        forge script script/DeployNlvTestnet.s.sol --rpc-url $TESTNET_RPC_URL --broadcast \
///          --private-key $TESTNET_DEPLOYER_KEY
contract DeployNlvTestnet is Script, NlvTestnetSetup {
  error WrongChain(uint256 chainId);

  function run() external {
    if (block.chainid != 46_630) revert WrongChain(block.chainid);
    Existing memory existing = _existing();

    vm.startBroadcast();
    (, address deployer,) = vm.readCallers();
    NlvDeployment memory deployed = _deployNlv(existing, deployer);
    vm.stopBroadcast();

    console.log("TestNLV (tNLV):      %s", address(deployed.token));
    console.log("RelayerRegistry:     %s", address(deployed.registry));
    console.log("NuluviumRouterV2:    %s", address(deployed.router));
    console.log("Pending owner (Safe) %s", SAFE);

    if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
      string memory key = "nlv";
      vm.serializeAddress(key, "testNlv", address(deployed.token));
      vm.serializeAddress(key, "relayerRegistry", address(deployed.registry));
      vm.serializeAddress(key, "routerV2", address(deployed.router));
      vm.serializeAddress(key, "treasury", SAFE);
      vm.serializeAddress(key, "pendingOwner", SAFE);
      vm.serializeAddress(key, "deployer", deployer);
      vm.serializeUint(key, "minBond", MIN_BOND);
      vm.serializeUint(key, "unbondDelaySeconds", deployed.registry.UNBOND_DELAY());
      vm.serializeUint(key, "protocolFeeBps", deployed.router.PROTOCOL_FEE_BPS());
      string memory json = vm.serializeUint(key, "relayerShareBps", deployed.router.RELAYER_SHARE_BPS());
      vm.writeJson(json, "deployments/46630-nlv.json");
    }
  }
}
