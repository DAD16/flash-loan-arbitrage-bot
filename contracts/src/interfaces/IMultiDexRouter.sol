// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title IMultiDexRouter
 * @notice Interface for multi-DEX routing
 */
interface IMultiDexRouter {
    /// @notice DEX identifiers
    enum DexId {
        UniswapV3,
        SushiSwap,
        Curve,
        Balancer,
        PancakeSwap,
        Camelot,
        Velodrome,
        Aerodrome
    }

    /// @notice Swap parameters for a single DEX
    struct SwapParams {
        DexId dex;
        address pool;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        bytes extraData;
    }

    /// @notice Multi-hop swap path
    struct SwapPath {
        SwapParams[] swaps;
        uint256 deadline;
    }

    /// @notice Execute a single swap
    function swap(SwapParams calldata params) external returns (uint256 amountOut);

    /// @notice Execute multi-hop swap
    function swapMultiHop(SwapPath calldata path) external returns (uint256 amountOut);

    /// @notice Get expected output for a swap
    function getAmountOut(SwapParams calldata params) external view returns (uint256);

    /// @notice Get expected output for multi-hop
    function getAmountsOut(SwapPath calldata path) external view returns (uint256[] memory);
}
