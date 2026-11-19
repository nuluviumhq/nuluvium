// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {ERC1967Proxy} from "@oz/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {console} from "forge-std/console.sol";

import {DeployLib} from "contracts/lib/DeployLib.sol";
import {Entrypoint} from "contracts/Entrypoint.sol";
import {PrivacyPoolComplex} from "contracts/implementations/PrivacyPoolComplex.sol";
import {CommitmentVerifier} from "contracts/verifiers/CommitmentVerifier.sol";
import {WithdrawalVerifier} from "contracts/verifiers/WithdrawalVerifier.sol";
import {IPrivacyPool} from "interfaces/IPrivacyPool.sol";
import {ICreateX} from "interfaces/external/ICreateX.sol";

import {MockUSDG} from "../src/MockUSDG.sol";

/// @title DeployTestnet
/// @notice Deploys Privacy Pools v1 (unchanged, from lib/privacy-pools-core at v1.3.0) on Robinhood
///         Chain testnet with a single pool for MockUSDG.
/// @dev Same steps and CreateX salts as upstream `script/BaseDeploy.s.sol`, minus the native ETH pool
///      (Nuluvium only shields USDG). In session 1.2 one testnet key holds every role; the ASP
///      postman moves to its own key in session 1.3.
///
///      Run (from contracts/, after loading ../.dev.vars into the environment):
///        forge script script/DeployTestnet.s.sol --rpc-url robinhood_testnet --broadcast \
///          --private-key $TESTNET_DEPLOYER_KEY
contract DeployTestnet is Script {
  uint256 internal constant TESTNET_CHAIN_ID = 46_630;
  ICreateX internal constant CREATEX = ICreateX(0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed);

  // Pool configuration (testnet values; mainnet values are decided before session 1.9).
  uint256 internal constant MINIMUM_DEPOSIT = 1e6; // 1 USDG
  uint256 internal constant VETTING_FEE_BPS = 0; // no deposit fee on testnet
  uint256 internal constant MAX_RELAY_FEE_BPS = 100; // relayer may charge up to 1% per withdrawal

  error WrongChain(uint256 chainId);

  struct Deployment {
    address usdg;
    address withdrawalVerifier;
    address ragequitVerifier;
    address entrypointImplementation;
    address entrypoint;
    address pool;
    uint256 scope;
  }

  function run() external returns (Deployment memory deployed) {
    if (block.chainid != TESTNET_CHAIN_ID) revert WrongChain(block.chainid);

    vm.startBroadcast();
    (, address deployer,) = vm.readCallers();
    deployed = deploy(deployer, deployer, deployer);
    vm.stopBroadcast();

    _log(deployed);
    _save(deployed, deployer);
  }

  /// @notice Deploys every contract. Public so tests can run the exact same steps.
  function deploy(address deployer, address owner, address postman) public returns (Deployment memory d) {
    d.usdg = address(new MockUSDG());

    d.withdrawalVerifier = CREATEX.deployCreate2(
      DeployLib.salt(deployer, DeployLib.WITHDRAWAL_VERIFIER_SALT), type(WithdrawalVerifier).creationCode
    );
    d.ragequitVerifier = CREATEX.deployCreate2(
      DeployLib.salt(deployer, DeployLib.RAGEQUIT_VERIFIER_SALT), type(CommitmentVerifier).creationCode
    );

    // Entrypoint is a UUPS proxy, initialised in the same transaction as its deployment.
    d.entrypointImplementation =
      CREATEX.deployCreate2(DeployLib.salt(deployer, DeployLib.ENTRYPOINT_IMPL_SALT), type(Entrypoint).creationCode);
    bytes memory initData = abi.encodeCall(Entrypoint.initialize, (owner, postman));
    d.entrypoint = CREATEX.deployCreate2(
      DeployLib.salt(deployer, DeployLib.ENTRYPOINT_PROXY_SALT),
      abi.encodePacked(type(ERC1967Proxy).creationCode, abi.encode(d.entrypointImplementation, initData))
    );

    // ERC20 pool for USDG, salted by symbol exactly like upstream.
    bytes11 poolSalt = bytes11(keccak256(abi.encodePacked(DeployLib.COMPLEX_POOL_SALT, "USDG")));
    d.pool = CREATEX.deployCreate2(
      DeployLib.salt(deployer, poolSalt),
      abi.encodePacked(
        type(PrivacyPoolComplex).creationCode,
        abi.encode(d.entrypoint, d.withdrawalVerifier, d.ragequitVerifier, d.usdg)
      )
    );

    Entrypoint(payable(d.entrypoint)).registerPool(
      IERC20(d.usdg), IPrivacyPool(d.pool), MINIMUM_DEPOSIT, VETTING_FEE_BPS, MAX_RELAY_FEE_BPS
    );
    d.scope = IPrivacyPool(d.pool).SCOPE();
  }

  function _log(Deployment memory d) private pure {
    console.log("MockUSDG:            %s", d.usdg);
    console.log("WithdrawalVerifier:  %s", d.withdrawalVerifier);
    console.log("CommitmentVerifier:  %s", d.ragequitVerifier);
    console.log("Entrypoint (impl):   %s", d.entrypointImplementation);
    console.log("Entrypoint (proxy):  %s", d.entrypoint);
    console.log("USDG pool:           %s", d.pool);
    console.log("Pool scope:          %s", d.scope);
  }

  /// @dev Writes deployments/46630.json only for a real broadcast, for the scripts in ../testnet.
  ///      No block number here: on Arbitrum chains `block.number` is the L1 block. The scripts take
  ///      the L2 deploy block from forge's broadcast receipts instead.
  function _save(Deployment memory d, address deployer) private {
    if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return;
    string memory key = "deployment";
    vm.serializeUint(key, "chainId", block.chainid);
    vm.serializeAddress(key, "deployer", deployer);
    vm.serializeAddress(key, "usdg", d.usdg);
    vm.serializeAddress(key, "withdrawalVerifier", d.withdrawalVerifier);
    vm.serializeAddress(key, "ragequitVerifier", d.ragequitVerifier);
    vm.serializeAddress(key, "entrypointImplementation", d.entrypointImplementation);
    vm.serializeAddress(key, "entrypoint", d.entrypoint);
    vm.serializeAddress(key, "pool", d.pool);
    string memory json = vm.serializeString(key, "scope", vm.toString(d.scope));
    vm.writeJson(json, "deployments/46630.json");
  }
}
