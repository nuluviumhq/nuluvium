// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {RelayerRegistry} from "../src/RelayerRegistry.sol";
import {TestNLV} from "../src/TestNLV.sol";

/// @title BondRelayerTestnet
/// @notice Run by a relayer operator with the relayer's own key: claims tNLV from the token's faucet
///         path when the key holds less than the minimum bond, approves the registry and registers the
///         key with its public URL. Needs a little testnet ETH for three transactions.
///
///      From contracts/:
///        RELAYER_URL=https://relayer.example forge script script/BondRelayerTestnet.s.sol \
///          --rpc-url $TESTNET_RPC_URL --broadcast --private-key $RELAYER_KEY
contract BondRelayerTestnet is Script {
  error WrongChain(uint256 chainId);

  function run() external {
    if (block.chainid != 46_630) revert WrongChain(block.chainid);
    string memory file = vm.readFile("deployments/46630-nlv.json");
    TestNLV token = TestNLV(vm.parseJsonAddress(file, ".testNlv"));
    RelayerRegistry registry = RelayerRegistry(vm.parseJsonAddress(file, ".relayerRegistry"));
    string memory url = vm.envString("RELAYER_URL");
    uint256 bond = registry.MIN_BOND();

    vm.startBroadcast();
    (, address relayer,) = vm.readCallers();
    if (token.balanceOf(relayer) < bond) token.claim();
    token.approve(address(registry), bond);
    registry.register(url, bond);
    vm.stopBroadcast();

    console.log("Registered %s at %s with %s tNLV (wei)", relayer, url, bond);
  }
}
