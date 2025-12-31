// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IPoolAddressesProvider} from "@aave/v3-core/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPool} from "@aave/v3-core/contracts/interfaces/IPool.sol";
import {IFlashLoanSimpleReceiver} from "@aave/v3-core/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FlashLoanReceiver
 * @author Matrix Team
 * @notice ARCHITECT - Flash loan receiver for arbitrage execution
 * @dev Receives flash loans from Aave V3 and executes arbitrage swaps
 */
contract FlashLoanReceiver is IFlashLoanSimpleReceiver, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Errors ============
    error InvalidInitiator();
    error InvalidPool();
    error UnauthorizedCaller();
    error SwapFailed();
    error InsufficientProfit();
    error InvalidSwapData();

    // ============ Events ============
    event ArbitrageExecuted(
        address indexed token,
        uint256 amount,
        uint256 profit,
        bytes32 indexed opportunityId
    );
    event SwapExecuted(
        address indexed dex,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event ProfitWithdrawn(address indexed token, address indexed to, uint256 amount);

    // ============ State ============
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    IPool public immutable POOL;

    /// @notice Authorized executors who can initiate flash loans
    mapping(address => bool) public authorizedExecutors;

    /// @notice Whitelisted DEX routers
    mapping(address => bool) public whitelistedDexes;

    /// @notice Minimum profit threshold in basis points (default 10 = 0.1%)
    uint256 public minProfitBps = 10;

    // ============ Structs ============
    struct SwapParams {
        address dex;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        bytes data;
    }

    struct ArbitrageParams {
        bytes32 opportunityId;
        SwapParams[] swaps;
        uint256 expectedProfit;
    }

    // ============ Constructor ============
    constructor(address _addressProvider) Ownable(msg.sender) {
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
        POOL = IPool(IPoolAddressesProvider(_addressProvider).getPool());
        authorizedExecutors[msg.sender] = true;
    }

    // ============ External Functions ============

    /**
     * @notice Execute flash loan arbitrage
     * @param asset The token to borrow
     * @param amount The amount to borrow
     * @param params Encoded ArbitrageParams
     */
    function executeArbitrage(
        address asset,
        uint256 amount,
        bytes calldata params
    ) external nonReentrant {
        if (!authorizedExecutors[msg.sender]) revert UnauthorizedCaller();

        POOL.flashLoanSimple(address(this), asset, amount, params, 0);
    }

    /**
     * @notice Aave flash loan callback
     * @param asset The borrowed token
     * @param amount The borrowed amount
     * @param premium The flash loan fee
     * @param initiator Who initiated the flash loan
     * @param params Encoded swap parameters
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // Security checks
        if (msg.sender != address(POOL)) revert InvalidPool();
        if (initiator != address(this)) revert InvalidInitiator();

        // Decode and execute arbitrage
        ArbitrageParams memory arbParams = abi.decode(params, (ArbitrageParams));

        // Execute swaps
        uint256 currentBalance = amount;
        for (uint256 i = 0; i < arbParams.swaps.length; i++) {
            currentBalance = _executeSwap(arbParams.swaps[i], currentBalance);
        }

        // Calculate profit
        uint256 totalOwed = amount + premium;
        if (currentBalance < totalOwed) revert InsufficientProfit();

        uint256 profit = currentBalance - totalOwed;

        // Check minimum profit
        uint256 minProfit = (amount * minProfitBps) / 10000;
        if (profit < minProfit) revert InsufficientProfit();

        // Approve repayment
        IERC20(asset).safeIncreaseAllowance(address(POOL), totalOwed);

        emit ArbitrageExecuted(asset, amount, profit, arbParams.opportunityId);

        return true;
    }

    // ============ Internal Functions ============

    /**
     * @notice Execute a single swap
     * @param swap The swap parameters
     * @param amountIn The input amount (may differ from swap.amountIn for chained swaps)
     * @return amountOut The output amount
     */
    function _executeSwap(
        SwapParams memory swap,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        if (!whitelistedDexes[swap.dex]) revert InvalidSwapData();

        // Approve DEX
        IERC20(swap.tokenIn).safeIncreaseAllowance(swap.dex, amountIn);

        // Get balance before swap
        uint256 balanceBefore = IERC20(swap.tokenOut).balanceOf(address(this));

        // Execute swap
        (bool success, ) = swap.dex.call(swap.data);
        if (!success) revert SwapFailed();

        // Calculate output
        amountOut = IERC20(swap.tokenOut).balanceOf(address(this)) - balanceBefore;

        if (amountOut < swap.minAmountOut) revert SwapFailed();

        emit SwapExecuted(swap.dex, swap.tokenIn, swap.tokenOut, amountIn, amountOut);
    }

    // ============ Admin Functions ============

    /**
     * @notice Set authorized executor status
     * @param executor The executor address
     * @param authorized Whether to authorize
     */
    function setAuthorizedExecutor(
        address executor,
        bool authorized
    ) external onlyOwner {
        authorizedExecutors[executor] = authorized;
    }

    /**
     * @notice Whitelist a DEX router
     * @param dex The DEX router address
     * @param whitelisted Whether to whitelist
     */
    function setWhitelistedDex(
        address dex,
        bool whitelisted
    ) external onlyOwner {
        whitelistedDexes[dex] = whitelisted;
    }

    /**
     * @notice Set minimum profit threshold
     * @param _minProfitBps Minimum profit in basis points
     */
    function setMinProfitBps(uint256 _minProfitBps) external onlyOwner {
        minProfitBps = _minProfitBps;
    }

    /**
     * @notice Withdraw profits
     * @param token The token to withdraw
     * @param to The recipient
     * @param amount The amount (0 for all)
     */
    function withdrawProfits(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 withdrawAmount = amount == 0 ? balance : amount;
        IERC20(token).safeTransfer(to, withdrawAmount);
        emit ProfitWithdrawn(token, to, withdrawAmount);
    }

    /**
     * @notice Emergency function to rescue stuck tokens
     * @param token The token to rescue
     * @param to The recipient
     */
    function rescueTokens(address token, address to) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(to, balance);
    }
}
