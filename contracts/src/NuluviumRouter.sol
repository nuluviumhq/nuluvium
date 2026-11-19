// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@oz/access/Ownable2Step.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@oz/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@oz/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@oz/utils/cryptography/SignatureChecker.sol";
import {Pausable} from "@oz/utils/Pausable.sol";
import {ReentrancyGuard} from "@oz/utils/ReentrancyGuard.sol";

import {ProofLib} from "contracts/lib/ProofLib.sol";
import {IEntrypoint} from "interfaces/IEntrypoint.sol";
import {IPrivacyPool} from "interfaces/IPrivacyPool.sol";

/// @notice Uniswap SwapRouter02 single-pool swap (IV3SwapRouter; no deadline field in this version).
interface ISwapRouter02 {
  struct ExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint24 fee;
    address recipient;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint160 sqrtPriceLimitX96;
  }

  function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
  function factory() external view returns (address);
}

interface IUniswapV3Factory {
  function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

/// @title NuluviumRouter
/// @notice Executes one piece of a private order for a fresh address that holds no ETH.
///         The fresh address signs an EIP-2612 permit and an EIP-712 order; a relayer submits both
///         and pays the gas. The Router swaps between USDG and one allowlisted stock token on that
///         token's Uniswap v3 pool and sends the output to the fresh address.
/// @dev Never holds funds between transactions: every token pulled in is swapped or paid out in
///      the same call. Not upgradeable. The owner can only manage the allowlist and pause swaps.
contract NuluviumRouter is EIP712, Ownable2Step, Pausable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  /// @notice What the fresh address agrees to. One side of every order is USDG.
  struct Order {
    address owner; // the fresh address: signs, pays tokenIn, receives tokenOut
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    uint256 minAmountOut; // net amount the owner must receive, after the relayer fee
    uint256 maxFee; // most USDG the relayer may take for this order
    uint256 nonce; // any unused number; each (owner, nonce) works once
    uint256 deadline; // unix seconds
  }

  /// @notice EIP-2612 permit for `amountIn` of `tokenIn`, signed by the owner, spender = this Router.
  struct PermitSignature {
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
  }

  bytes32 public constant ORDER_TYPEHASH = keccak256(
    "Order(address owner,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,uint256 maxFee,uint256 nonce,uint256 deadline)"
  );

  IERC20 public immutable USDG;
  ISwapRouter02 public immutable SWAP_ROUTER;
  /// @notice Privacy Pools Entrypoint whose withdrawals `relayAndSwap` combines with a buy.
  IEntrypoint public immutable ENTRYPOINT;

  /// @notice Uniswap v3 fee tier of the USDG pool for each allowlisted stock token; 0 = not allowed.
  mapping(address token => uint24 fee) public poolFee;
  /// @notice Orders already executed (or cancelled), per owner and nonce.
  mapping(address owner => mapping(uint256 nonce => bool used)) public nonceUsed;

  event Swapped(
    address indexed owner,
    uint256 indexed nonce,
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 amountOut,
    uint256 fee,
    address feeRecipient
  );
  event PoolFeeSet(address indexed token, uint24 fee);

  error OrderExpired();
  error NonceAlreadyUsed();
  error InvalidSignature();
  error TokenNotAllowed(address token);
  error OneSideMustBeUsdg();
  error FeeAboveMax(uint256 fee, uint256 maxFee);
  error FeeNotBelowAmount();
  error PoolDoesNotExist(address token, uint24 fee);
  error UsdgCannotBeListed();
  error WithdrawalRecipientIsNotOrderOwner();
  error RelayAndSwapOnlyBuys();

  constructor(IERC20 usdg, ISwapRouter02 swapRouter, IEntrypoint entrypoint, address initialOwner)
    EIP712("Nuluvium Router", "1")
    Ownable(initialOwner)
  {
    USDG = usdg;
    SWAP_ROUTER = swapRouter;
    ENTRYPOINT = entrypoint;
  }

  /*///////////////////////////////////////////////////////////////
                              SWAP
  //////////////////////////////////////////////////////////////*/

  /// @notice Executes a signed order. The caller (relayer) receives `fee` in USDG.
  /// @param fee USDG the relayer takes, at most `order.maxFee`. On a buy it comes out of the USDG
  ///        paid in; on a sell it comes out of the USDG received.
  /// @return amountOut What the owner received.
  function swap(Order calldata order, bytes calldata orderSignature, PermitSignature calldata permit, uint256 fee)
    external
    nonReentrant
    whenNotPaused
    returns (uint256 amountOut)
  {
    amountOut = _swap(order, orderSignature, permit, fee);
  }

  /// @notice One piece in one transaction: a private withdrawal from the shielded pool to the order
  ///         owner (the fresh address), then the buy. If the buy fails, the withdrawal is undone too
  ///         and the note stays in the pool.
  /// @dev The withdrawal terms (recipient, relay fee) are bound to the proof's context, so the
  ///      relayer cannot change them; this function only checks they point at the order owner.
  ///      The Router is not the processooor: Entrypoint.relay pays the recipient directly.
  function relayAndSwap(
    IPrivacyPool.Withdrawal calldata withdrawal,
    ProofLib.WithdrawProof calldata proof,
    uint256 scope,
    Order calldata order,
    bytes calldata orderSignature,
    PermitSignature calldata permit,
    uint256 fee
  ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
    if (order.tokenIn != address(USDG)) revert RelayAndSwapOnlyBuys();
    IEntrypoint.RelayData memory relayData = abi.decode(withdrawal.data, (IEntrypoint.RelayData));
    if (relayData.recipient != order.owner) revert WithdrawalRecipientIsNotOrderOwner();

    ENTRYPOINT.relay(withdrawal, proof, scope);
    amountOut = _swap(order, orderSignature, permit, fee);
  }

  /// @dev Shared by `swap` and `relayAndSwap`; the caller (relayer) receives `fee`.
  function _swap(Order calldata order, bytes calldata orderSignature, PermitSignature calldata permit, uint256 fee)
    private
    returns (uint256 amountOut)
  {
    if (block.timestamp > order.deadline) revert OrderExpired();
    if (fee > order.maxFee) revert FeeAboveMax(fee, order.maxFee);
    if (nonceUsed[order.owner][order.nonce]) revert NonceAlreadyUsed();

    bool isBuy = order.tokenIn == address(USDG);
    if (!isBuy && order.tokenOut != address(USDG)) revert OneSideMustBeUsdg();
    address stock = isBuy ? order.tokenOut : order.tokenIn;
    uint24 tier = poolFee[stock];
    if (tier == 0) revert TokenNotAllowed(stock);

    if (!SignatureChecker.isValidSignatureNow(order.owner, hashOrder(order), orderSignature)) revert InvalidSignature();
    nonceUsed[order.owner][order.nonce] = true;

    _pullWithPermit(order, permit);

    if (isBuy) {
      // Relayer fee out of the USDG paid in; the rest buys the stock token for the owner.
      if (fee >= order.amountIn) revert FeeNotBelowAmount();
      if (fee > 0) USDG.safeTransfer(msg.sender, fee);
      amountOut = _swapExactIn(order.tokenIn, order.tokenOut, tier, order.amountIn - fee, order.minAmountOut, order.owner);
    } else {
      // Sell into this contract, then split: relayer fee first, the rest to the owner.
      uint256 received = _swapExactIn(order.tokenIn, order.tokenOut, tier, order.amountIn, order.minAmountOut + fee, address(this));
      if (fee > 0) USDG.safeTransfer(msg.sender, fee);
      amountOut = received - fee;
      USDG.safeTransfer(order.owner, amountOut);
    }

    emit Swapped(order.owner, order.nonce, order.tokenIn, order.tokenOut, order.amountIn, amountOut, fee, msg.sender);
  }

  /// @notice EIP-712 digest the owner signs for `order`.
  function hashOrder(Order calldata order) public view returns (bytes32) {
    return _hashTypedDataV4(keccak256(abi.encode(ORDER_TYPEHASH, order)));
  }

  /// @notice Domain separator of this Router, for clients building signatures.
  // forge-lint: disable-next-line(mixed-case-function)
  function DOMAIN_SEPARATOR() external view returns (bytes32) {
    return _domainSeparatorV4();
  }

  /*///////////////////////////////////////////////////////////////
                              OWNER
  //////////////////////////////////////////////////////////////*/

  /// @notice Allows a stock token through its USDG pool at `fee`, or removes it with fee 0.
  /// @dev The pool must exist in the SwapRouter's factory, so a typo cannot point swaps at nothing.
  function setPoolFee(address token, uint24 fee) external onlyOwner {
    if (token == address(USDG)) revert UsdgCannotBeListed();
    if (fee != 0) {
      address factory = SWAP_ROUTER.factory();
      if (IUniswapV3Factory(factory).getPool(address(USDG), token, fee) == address(0)) revert PoolDoesNotExist(token, fee);
    }
    poolFee[token] = fee;
    emit PoolFeeSet(token, fee);
  }

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  /*///////////////////////////////////////////////////////////////
                              INTERNAL
  //////////////////////////////////////////////////////////////*/

  /// @dev Uses the permit when it is still valid. If someone already submitted it (front-running the
  ///      permit only spends its nonce), the allowance is in place and transferFrom still succeeds.
  function _pullWithPermit(Order calldata order, PermitSignature calldata permit) private {
    try IERC20Permit(order.tokenIn).permit(
      order.owner, address(this), order.amountIn, permit.deadline, permit.v, permit.r, permit.s
    ) {} catch {}
    IERC20(order.tokenIn).safeTransferFrom(order.owner, address(this), order.amountIn);
  }

  function _swapExactIn(
    address tokenIn,
    address tokenOut,
    uint24 tier,
    uint256 amountIn,
    uint256 minimumOut,
    address recipient
  ) private returns (uint256 amountOut) {
    // Exact-input swaps spend the full approval, so no allowance is left behind.
    IERC20(tokenIn).forceApprove(address(SWAP_ROUTER), amountIn);
    amountOut = SWAP_ROUTER.exactInputSingle(
      ISwapRouter02.ExactInputSingleParams({
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        fee: tier,
        recipient: recipient,
        amountIn: amountIn,
        amountOutMinimum: minimumOut,
        sqrtPriceLimitX96: 0
      })
    );
  }
}
