// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

/// @notice Base for tests that fork Robinhood Chain. They need network access, so they are skipped
///         unless FORK_TESTS=true: `forge test` passes offline and in sandboxes, and
///         `FORK_TESTS=true forge test` runs them against the live chains.
///         ROBINHOOD_MAINNET_RPC / ROBINHOOD_TESTNET_RPC override the public RPCs in foundry.toml
///         (some networks block *.robinhood.com).
abstract contract ForkTest is Test {
  function _fork(string memory network) internal {
    if (!vm.envOr("FORK_TESTS", false)) {
      vm.skip(true);
      return;
    }
    string memory overrideVar = keccak256(bytes(network)) == keccak256("robinhood_mainnet") ? "ROBINHOOD_MAINNET_RPC" : "ROBINHOOD_TESTNET_RPC";
    vm.createSelectFork(vm.envOr(overrideVar, vm.rpcUrl(network)));
  }
}
