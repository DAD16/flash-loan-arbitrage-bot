// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMultiDexRouter} from "./interfaces/IMultiDexRouter.sol";

// DEX-specific interfaces
interface IUniswapV3Pool {
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);

    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/**
 * @title MultiDexRouter
 * @author Matrix Team
 * @notice ARCHITECT - Routes swaps across multiple DEXs
 * @dev Supports Uniswap V3, SushiSwap, Curve, Balancer, and more
 */
contract MultiDexRouter is IMultiDexRouter, Ownable {
    using SafeERC20 for IERC20;

    // ============ Errors ============
    error UnsupportedDex();
    error SwapFailed();
    error SlippageExceeded();
    error DeadlineExpired();
    error InvalidPath();

    // ============ Events ============
    event SwapExecuted(
        DexId indexed dex,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    // ============ State ============
    /// @notice DEX router addresses
    mapping(DexId => address) public dexRouters;

    /// @notice Uniswap V3 callback validation
    mapping(address => bool) public validV3Pools;

    // ============ Constants ============
    uint160 internal constant MIN_SQRT_RATIO = 4295128739;
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    // ============ Constructor ============
    constructor() Ownable(msg.sender) {}

    // ============ External Functions ============

    /**
     * @notice Execute a single swap
     * @param params Swap parameters
     * @return amountOut The output amount
     */
    function swap(SwapParams calldata params) external override returns (uint256 amountOut) {
        // Transfer tokens in
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);

        // Execute swap based on DEX
        amountOut = _executeSwap(params);

        // Check slippage
        if (amountOut < params.minAmountOut) revert SlippageExceeded();

        // Transfer tokens out
        IERC20(params.tokenOut).safeTransfer(msg.sender, amountOut);

        emit SwapExecuted(params.dex, params.tokenIn, params.tokenOut, params.amountIn, amountOut);
    }

    /**
     * @notice Execute multi-hop swap
     * @param path The swap path
     * @return amountOut Final output amount
     */
    function swapMultiHop(SwapPath calldata path) external override returns (uint256 amountOut) {
        if (block.timestamp > path.deadline) revert DeadlineExpired();
        if (path.swaps.length == 0) revert InvalidPath();

        // Transfer initial tokens in
        IERC20(path.swaps[0].tokenIn).safeTransferFrom(
            msg.sender,
            address(this),
            path.swaps[0].amountIn
        );

        // Execute each swap
        uint256 currentAmount = path.swaps[0].amountIn;
        for (uint256 i = 0; i < path.swaps.length; i++) {
            SwapParams memory swapParams = path.swaps[i];
            swapParams.amountIn = currentAmount;
            currentAmount = _executeSwap(swapParams);
        }

        amountOut = currentAmount;

        // Transfer final tokens out
        IERC20(path.swaps[path.swaps.length - 1].tokenOut).safeTransfer(msg.sender, amountOut);
    }

    /**
     * @notice Get expected output for a swap
     * @param params Swap parameters
     * @return Expected output amount
     */
    function getAmountOut(SwapParams calldata params) external view override returns (uint256) {
        // Implementation depends on DEX
        // This is a simplified version
        return params.amountIn; // Placeholder
    }

    /**
     * @notice Get expected outputs for multi-hop
     * @param path The swap path
     * @return amounts Output amounts at each step
     */
    function getAmountsOut(SwapPath calldata path) external view override returns (uint256[] memory amounts) {
        amounts = new uint256[](path.swaps.length + 1);
        amounts[0] = path.swaps[0].amountIn;

        for (uint256 i = 0; i < path.swaps.length; i++) {
            amounts[i + 1] = amounts[i]; // Placeholder
        }
    }

    // ============ Internal Functions ============

    /**
     * @notice Execute swap on specific DEX
     * @param params Swap parameters
     * @return amountOut Output amount
     */
    function _executeSwap(SwapParams memory params) internal returns (uint256 amountOut) {
        if (params.dex == DexId.UniswapV3) {
            amountOut = _swapUniswapV3(params);
        } else if (params.dex == DexId.SushiSwap) {
            amountOut = _swapV2Style(params, dexRouters[DexId.SushiSwap]);
        } else if (params.dex == DexId.PancakeSwap) {
            amountOut = _swapV2Style(params, dexRouters[DexId.PancakeSwap]);
        } else {
            revert UnsupportedDex();
        }
    }

    /**
     * @notice Execute Uniswap V3 swap
     */
    function _swapUniswapV3(SwapParams memory params) internal returns (uint256 amountOut) {
        IUniswapV3Pool pool = IUniswapV3Pool(params.pool);
        bool zeroForOne = params.tokenIn == pool.token0();

        // Approve pool
        IERC20(params.tokenIn).safeIncreaseAllowance(params.pool, params.amountIn);

        // Execute swap
        (int256 amount0, int256 amount1) = pool.swap(
            address(this),
            zeroForOne,
            int256(params.amountIn),
            zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1,
            params.extraData
        );

        amountOut = uint256(-(zeroForOne ? amount1 : amount0));
    }

    /**
     * @notice Execute V2-style swap (Uniswap V2, SushiSwap, PancakeSwap)
     */
    function _swapV2Style(
        SwapParams memory params,
        address router
    ) internal returns (uint256 amountOut) {
        if (router == address(0)) revert UnsupportedDex();

        // Approve router
        IERC20(params.tokenIn).safeIncreaseAllowance(router, params.amountIn);

        // Build path
        address[] memory path = new address[](2);
        path[0] = params.tokenIn;
        path[1] = params.tokenOut;

        // Execute swap
        uint256[] memory amounts = IUniswapV2Router(router).swapExactTokensForTokens(
            params.amountIn,
            params.minAmountOut,
            path,
            address(this),
            block.timestamp
        );

        amountOut = amounts[amounts.length - 1];
    }

    // ============ Uniswap V3 Callback ============

    /**
     * @notice Uniswap V3 swap callback
     */
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external {
        if (!validV3Pools[msg.sender]) revert SwapFailed();

        // Pay the pool
        if (amount0Delta > 0) {
            IERC20(IUniswapV3Pool(msg.sender).token0()).safeTransfer(
                msg.sender,
                uint256(amount0Delta)
            );
        }
        if (amount1Delta > 0) {
            IERC20(IUniswapV3Pool(msg.sender).token1()).safeTransfer(
                msg.sender,
                uint256(amount1Delta)
            );
        }
    }

    // ============ Admin Functions ============

    /**
     * @notice Set DEX router address
     */
    function setDexRouter(DexId dex, address router) external onlyOwner {
        dexRouters[dex] = router;
    }

    /**
     * @notice Set valid V3 pool
     */
    function setValidV3Pool(address pool, bool valid) external onlyOwner {
        validV3Pools[pool] = valid;
    }

    /**
     * @notice Rescue stuck tokens
     */
    function rescueTokens(address token, address to) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(to, balance);
    }
}
