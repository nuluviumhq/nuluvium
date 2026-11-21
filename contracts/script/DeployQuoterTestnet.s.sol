// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {console} from "forge-std/console.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {MockQuoterV2, MockSwapRouter} from "../test/mocks/RouterMocks.sol";

/// @title DeployQuoterTestnet
/// @notice Testnet only: deploys a QuoterV2 stand-in that quotes the fixed-price mock swap router in
///         deployments/46630-router.json, so minimum outputs come from the same quoter call as on
///         mainnet. Holds no funds and has no owner.
///
///      Run (from contracts/, after loading ../.dev.vars):
///        forge script script/DeployQuoterTestnet.s.sol --rpc-url robinhood_testnet --broadcast \
///          --private-key $TESTNET_DEPLOYER_KEY
contract DeployQuoterTestnet is Script {
  using stdJson for string;

  error WrongChain(uint256 chainId);

  function run() external {
    if (block.chainid != 46_630) revert WrongChain(block.chainid);
    address swapRouter = vm.readFile("deployments/46630-router.json").readAddress(".mockSwapRouter");

    vm.startBroadcast();
    MockQuoterV2 quoter = new MockQuoterV2(MockSwapRouter(swapRouter));
    vm.stopBroadcast();
    console.log("Mock quoter:         %s", address(quoter));

    if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
      string memory json = vm.serializeAddress("quoter", "mockQuoter", address(quoter));
      vm.writeJson(json, "deployments/46630-quoter.json");
    }
  }
}
