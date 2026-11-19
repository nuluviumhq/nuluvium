// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {console} from "forge-std/console.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {IEntrypoint} from "interfaces/IEntrypoint.sol";

import {ISwapRouter02, NuluviumRouter} from "../src/NuluviumRouter.sol";
// Testnet only: Robinhood Chain testnet has no official Uniswap (docs/testnet.md), so the swap leg
// uses a labelled fixed-price mock. Real prices are covered by the mainnet fork tests.
import {MockFactory, MockStock, MockSwapRouter} from "../test/mocks/RouterMocks.sol";

/// @title DeployRouterTestnet
/// @notice Deploys NuluviumRouter on testnet next to the Privacy Pools deployment in
///         deployments/46630.json, with a mock stock token and a fixed-price mock swap router.
///
///      Run (from contracts/, after loading ../.dev.vars):
///        forge script script/DeployRouterTestnet.s.sol --rpc-url robinhood_testnet --broadcast \
///          --private-key $TESTNET_DEPLOYER_KEY
contract DeployRouterTestnet is Script {
  using stdJson for string;

  uint24 internal constant TIER = 500;
  uint256 internal constant MOCK_USDG_PER_STOCK = 180e6; // fixed mock price: 1 token = 180 tUSDG

  error WrongChain(uint256 chainId);

  function run() external {
    if (block.chainid != 46_630) revert WrongChain(block.chainid);
    string memory pools = vm.readFile("deployments/46630.json");
    address usdg = pools.readAddress(".usdg");
    address entrypoint = pools.readAddress(".entrypoint");

    vm.startBroadcast();
    (, address deployer,) = vm.readCallers();

    MockStock stock = new MockStock();
    MockFactory factory = new MockFactory();
    MockSwapRouter swapRouter = new MockSwapRouter(address(factory), usdg, MOCK_USDG_PER_STOCK);
    factory.setPool(usdg, address(stock), TIER, address(swapRouter));

    NuluviumRouter router =
      new NuluviumRouter(IERC20(usdg), ISwapRouter02(address(swapRouter)), IEntrypoint(entrypoint), deployer);
    router.setPoolFee(address(stock), TIER);
    vm.stopBroadcast();

    console.log("Mock stock (MSTK):   %s", address(stock));
    console.log("Mock factory:        %s", address(factory));
    console.log("Mock swap router:    %s", address(swapRouter));
    console.log("NuluviumRouter:      %s", address(router));

    if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
      string memory key = "router";
      vm.serializeAddress(key, "mockStock", address(stock));
      vm.serializeAddress(key, "mockFactory", address(factory));
      vm.serializeAddress(key, "mockSwapRouter", address(swapRouter));
      vm.serializeUint(key, "mockUsdgPerStock", MOCK_USDG_PER_STOCK);
      vm.serializeUint(key, "poolFee", TIER);
      vm.serializeAddress(key, "owner", deployer);
      string memory json = vm.serializeAddress(key, "router", address(router));
      vm.writeJson(json, "deployments/46630-router.json");
    }
  }
}
