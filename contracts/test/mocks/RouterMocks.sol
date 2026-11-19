// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {ERC20} from "@oz/token/ERC20/ERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {ERC20Permit} from "@oz/token/ERC20/extensions/ERC20Permit.sol";

import {ProofLib} from "contracts/lib/ProofLib.sol";
import {IPrivacyPool} from "interfaces/IPrivacyPool.sol";

import {ISwapRouter02} from "../../src/NuluviumRouter.sol";

/// Stock token stand-in: 18 decimals, EIP-2612, mintable by anyone (tests only).
contract MockStock is ERC20, ERC20Permit {
  constructor() ERC20("Mock Stock", "MSTK") ERC20Permit("Mock Stock") {}

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}

/// Factory stand-in: a pool "exists" for pairs registered with setPool.
contract MockFactory {
  mapping(bytes32 key => address pool) private pools;

  function setPool(address tokenA, address tokenB, uint24 fee, address pool) external {
    pools[_key(tokenA, tokenB, fee)] = pool;
    pools[_key(tokenB, tokenA, fee)] = pool;
  }

  function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address) {
    return pools[_key(tokenA, tokenB, fee)];
  }

  function _key(address a, address b, uint24 fee) private pure returns (bytes32) {
    return keccak256(abi.encode(a, b, fee));
  }
}

/// SwapRouter02 stand-in with a fixed price: 1 stock token (1e18) = `usdgPerStock` USDG units.
/// Pulls tokenIn from the caller, mints tokenOut to the recipient, enforces the minimum like Uniswap.
contract MockSwapRouter {
  address public immutable factory;
  address public immutable usdg;
  uint256 public usdgPerStock;
  uint24 public lastFee;

  error TooLittleReceived();

  constructor(address factory_, address usdg_, uint256 usdgPerStock_) {
    factory = factory_;
    usdg = usdg_;
    usdgPerStock = usdgPerStock_;
  }

  function setPrice(uint256 usdgPerStock_) external {
    usdgPerStock = usdgPerStock_;
  }

  function exactInputSingle(ISwapRouter02.ExactInputSingleParams calldata params) external returns (uint256 amountOut) {
    IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
    amountOut = params.tokenIn == usdg
      ? (params.amountIn * 1e18) / usdgPerStock
      : (params.amountIn * usdgPerStock) / 1e18;
    if (amountOut < params.amountOutMinimum) revert TooLittleReceived();
    lastFee = params.fee;
    MintableToken(params.tokenOut).mint(params.recipient, amountOut);
  }
}

interface MintableToken {
  function mint(address to, uint256 amount) external;
}

/// Entrypoint stand-in for relayAndSwap: `relay` pays `proof.pubSignals[0]` USDG (minted here) to the
/// recipient in the withdrawal's RelayData, like a real withdrawal with a zero relay fee.
contract MockEntrypoint {
  struct RelayData {
    address recipient;
    address feeRecipient;
    uint256 relayFeeBPS;
  }

  address public immutable usdg;
  uint256 public relays;

  constructor(address usdg_) {
    usdg = usdg_;
  }

  function relay(IPrivacyPool.Withdrawal calldata withdrawal, ProofLib.WithdrawProof calldata proof, uint256) external {
    RelayData memory data = abi.decode(withdrawal.data, (RelayData));
    relays += 1;
    MintableToken(usdg).mint(data.recipient, proof.pubSignals[0]);
  }
}
