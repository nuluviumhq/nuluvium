// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {NuluviumRouterV2} from "../src/NuluviumRouterV2.sol";
import {RelayerRegistry} from "../src/RelayerRegistry.sol";
import {TestNLV} from "../src/TestNLV.sol";
import {NlvTestnetSetup} from "./NlvTestnetSetup.sol";

/// @title NlvSafeBatchTestnet
/// @notice Builds the Safe batch after DeployNlvTestnet: RelayerRegistry.acceptOwnership,
///         NuluviumRouterV2.acceptOwnership and NuluviumRouterV2.setPoolFee(MSTK, 500). Simulates the
///         calls in order as the Safe on a fork of testnet, then writes a Safe Transaction Builder file
///         (app.safe.global → Apps → Transaction Builder → drag the file in). Sends nothing: run it
///         without --broadcast.
///
///      From contracts/, after loading ../.dev.vars:
///        forge script script/NlvSafeBatchTestnet.s.sol --rpc-url $TESTNET_RPC_URL
contract NlvSafeBatchTestnet is Script, NlvTestnetSetup {
  string internal constant OUT = "deployments/46630-nlv-safe-batch.json";

  error WrongChain(uint256 chainId);

  function run() external {
    if (block.chainid != 46_630) revert WrongChain(block.chainid);
    string memory file = vm.readFile("deployments/46630-nlv.json");
    NlvDeployment memory deployed = NlvDeployment({
      token: TestNLV(vm.parseJsonAddress(file, ".testNlv")),
      registry: RelayerRegistry(vm.parseJsonAddress(file, ".relayerRegistry")),
      router: NuluviumRouterV2(vm.parseJsonAddress(file, ".routerV2"))
    });
    address mockStock = _existing().mockStock;

    SafeCall[] memory calls = _safeCalls(deployed, mockStock);
    _simulateAsSafe(calls, deployed, mockStock);
    console.log("Simulated as the Safe %s: all %s calls ok; owners = Safe, MSTK listed at 0.05%%", SAFE, calls.length);

    vm.writeFile(OUT, _transactionBuilderJson(calls));
    console.log("Safe batch written: contracts/%s", OUT);
    for (uint256 i = 0; i < calls.length; ++i) {
      console.log("  %s", calls[i].decoded);
      console.log("    to %s data %s", calls[i].to, vm.toString(calls[i].data));
    }
  }

  function _transactionBuilderJson(SafeCall[] memory calls) private view returns (string memory json) {
    string memory transactions;
    for (uint256 i = 0; i < calls.length; ++i) {
      transactions = string.concat(
        transactions,
        i == 0 ? "" : ",",
        '\n    {"to": "',
        vm.toString(calls[i].to),
        '", "value": "0", "data": "',
        vm.toString(calls[i].data),
        '", "contractMethod": null, "contractInputsValues": null, "_decoded": "',
        calls[i].decoded,
        '"}'
      );
    }
    json = string.concat(
      '{\n  "version": "1.0",\n  "chainId": "46630",\n  "createdAt": ',
      vm.toString(block.timestamp * 1000),
      ',\n  "meta": {\n    "name": "Nuluvium relayer model setup (testnet)",\n',
      '    "description": "Accept ownership of RelayerRegistry and NuluviumRouterV2; list MSTK on Router v2 at 0.05%",\n',
      '    "txBuilderVersion": "1.18.0",\n    "createdFromSafeAddress": "',
      vm.toString(SAFE),
      '",\n    "createdFromOwnerAddress": ""\n  },\n  "transactions": [',
      transactions,
      "\n  ]\n}\n"
    );
  }
}
