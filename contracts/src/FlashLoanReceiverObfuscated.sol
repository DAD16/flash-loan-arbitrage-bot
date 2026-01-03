// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Obfuscation, CommitRevealStorage, ObfuscatedAccessControl} from "./lib/Obfuscation.sol";

/**
 * @title FlashLoanReceiverObfuscated
 * @author Matrix Team
 * @notice ARCHITECT - Obfuscated flash loan receiver for BSC/non-MEV-protected chains
 * @dev Implements multiple obfuscation layers:
 *
 * 1. XOR-encoded addresses - DEX routers hidden from bytecode analysis
 * 2. Hashed access control - Executor addresses not visible in storage
 * 3. Commit-reveal for execution - Hide trade intent until execution
 * 4. Non-standard function routing - Confuse decompilers
 * 5. Scrambled parameters - Values XOR'd with runtime keys
 *
 * USE THIS CONTRACT ON:
 * - BSC (BNB Smart Chain)
 * - Polygon
 * - Arbitrum
 * - Any chain without Flashbots/Titan Builder
 *
 * On Ethereum, use the standard FlashLoanReceiver.sol with private RPCs instead.
 */

// PancakeSwap V3 flash loan interface (BSC)
interface IPancakeV3Pool {
    function flash(
        address recipient,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;

    function token0() external view returns (address);
    function token1() external view returns (address);
}

// Generic DEX router interface
interface IDexRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

contract FlashLoanReceiverObfuscated is
    ReentrancyGuard,
    CommitRevealStorage,
    ObfuscatedAccessControl
{
    using SafeERC20 for IERC20;

    // ============ Errors ============
    error InvalidCallback();
    error SwapFailed();
    error InsufficientProfit();
    error InvalidCommand();
    error CodeSizeCheck();

    // ============ Events ============
    // Events are intentionally minimal to reduce information leakage
    event Executed(bytes32 indexed id, uint256 profit);

    // ============ Obfuscated Storage ============

    /// @notice XOR key for address decoding (set at deployment)
    bytes32 private immutable XOR_KEY;

    /// @notice Encoded flash loan pool addresses (up to 4)
    bytes32 private _encodedPools1;
    bytes32 private _encodedPools2;

    /// @notice Encoded DEX router addresses (up to 4)
    bytes32 private _encodedRouters1;
    bytes32 private _encodedRouters2;

    /// @notice Minimum profit in basis points (scrambled)
    uint256 private _scrambledMinProfit;
    uint256 private constant PROFIT_SCRAMBLE_KEY = 0xDEADBEEF;

    // ============ Command Codes ============
    // Use single bytes instead of function selectors
    uint8 private constant CMD_EXECUTE = 0x01;
    uint8 private constant CMD_COMMIT = 0x02;
    uint8 private constant CMD_REVEAL_EXECUTE = 0x03;
    uint8 private constant CMD_SET_POOL = 0x10;
    uint8 private constant CMD_SET_ROUTER = 0x11;
    uint8 private constant CMD_WITHDRAW = 0x20;

    // ============ Structs ============
    struct SwapParams {
        uint8 routerIndex;    // Index into encoded routers
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
    }

    struct ExecutionParams {
        uint8 poolIndex;      // Index into encoded pools
        address loanToken;
        uint256 loanAmount;
        SwapParams[] swaps;
        uint256 expectedProfit;
    }

    // ============ Constructor ============

    /**
     * @notice Deploy with obfuscation parameters
     * @param xorKey Random bytes32 for address encoding
     * @param accessSalt Salt for access control hashing
     * @param minRevealDelay Blocks between commit and reveal
     * @param maxRevealWindow Blocks before commitment expires
     */
    constructor(
        bytes32 xorKey,
        bytes32 accessSalt,
        uint256 minRevealDelay,
        uint256 maxRevealWindow
    )
        CommitRevealStorage(minRevealDelay, maxRevealWindow)
        ObfuscatedAccessControl(accessSalt)
    {
        XOR_KEY = xorKey;
        // Default min profit: 10 bps (0.1%), scrambled
        _scrambledMinProfit = Obfuscation.scrambleUint(10, PROFIT_SCRAMBLE_KEY);
    }

    // ============ Fallback with Custom Routing ============

    /**
     * @notice Main entry point using non-standard routing
     * @dev Command byte is at END of calldata, not beginning
     * This confuses standard function selector detection
     */
    fallback() external payable nonReentrant {
        // Anti-bot: Reject calls from contracts (optional)
        // _requireEOA();

        uint8 cmd = Obfuscation.extractTrailingCommand();

        if (cmd == CMD_EXECUTE) {
            _handleExecute();
        } else if (cmd == CMD_COMMIT) {
            _handleCommit();
        } else if (cmd == CMD_REVEAL_EXECUTE) {
            _handleRevealExecute();
        } else if (cmd == CMD_SET_POOL) {
            _handleSetPool();
        } else if (cmd == CMD_SET_ROUTER) {
            _handleSetRouter();
        } else if (cmd == CMD_WITHDRAW) {
            _handleWithdraw();
        } else {
            revert InvalidCommand();
        }
    }

    receive() external payable {}

    // ============ Flash Loan Callback ============

    /**
     * @notice PancakeSwap V3 flash callback
     * @dev Called by the pool after flash loan is sent
     */
    function pancakeV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external {
        // Verify caller is a valid pool
        if (!_isValidPool(msg.sender)) revert InvalidCallback();

        // Decode and execute
        ExecutionParams memory params = abi.decode(data, (ExecutionParams));
        _executeSwaps(params, fee0 > 0 ? fee0 : fee1);
    }

    // ============ Internal Execution ============

    function _handleExecute() internal onlyExecutorObfuscated {
        // Decode params (excluding last byte which is command)
        bytes memory data = msg.data[:msg.data.length - 1];
        ExecutionParams memory params = abi.decode(data, (ExecutionParams));

        _initiateFlashLoan(params);
    }

    function _handleCommit() internal {
        // Extract commitment hash from calldata
        bytes32 commitHash;
        assembly {
            commitHash := calldataload(0)
        }

        _commit(commitHash);
    }

    function _handleRevealExecute() internal {
        // Decode: commitmentId (32) + secret (32) + params (variable) + cmd (1)
        bytes32 commitmentId;
        bytes32 secret;

        assembly {
            commitmentId := calldataload(0)
            secret := calldataload(32)
        }

        bytes memory paramsData = msg.data[64:msg.data.length - 1];

        // Verify and consume commitment
        _reveal(commitmentId, paramsData, secret);

        // Execute
        ExecutionParams memory params = abi.decode(paramsData, (ExecutionParams));
        _initiateFlashLoan(params);
    }

    function _handleSetPool() internal onlyOwnerObfuscated {
        // Decode: index (1) + encoded pool (32) + cmd (1)
        uint8 index;
        bytes32 encodedPool;

        assembly {
            index := byte(0, calldataload(0))
            encodedPool := calldataload(1)
        }

        if (index < 2) {
            if (index == 0) {
                _encodedPools1 = encodedPool;
            } else {
                _encodedPools2 = encodedPool;
            }
        }
    }

    function _handleSetRouter() internal onlyOwnerObfuscated {
        uint8 index;
        bytes32 encodedRouter;

        assembly {
            index := byte(0, calldataload(0))
            encodedRouter := calldataload(1)
        }

        if (index < 2) {
            if (index == 0) {
                _encodedRouters1 = encodedRouter;
            } else {
                _encodedRouters2 = encodedRouter;
            }
        }
    }

    function _handleWithdraw() internal onlyOwnerObfuscated {
        address token;
        address to;

        assembly {
            token := shr(96, calldataload(0))
            to := shr(96, calldataload(20))
        }

        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(to, balance);
        }
    }

    function _initiateFlashLoan(ExecutionParams memory params) internal {
        address pool = _decodePool(params.poolIndex);

        IPancakeV3Pool(pool).flash(
            address(this),
            params.loanToken == IPancakeV3Pool(pool).token0() ? params.loanAmount : 0,
            params.loanToken == IPancakeV3Pool(pool).token1() ? params.loanAmount : 0,
            abi.encode(params)
        );
    }

    function _executeSwaps(
        ExecutionParams memory params,
        uint256 fee
    ) internal {
        uint256 currentAmount = params.loanAmount;

        for (uint256 i = 0; i < params.swaps.length; i++) {
            SwapParams memory swap = params.swaps[i];
            address router = _decodeRouter(swap.routerIndex);

            // Approve router
            IERC20(swap.tokenIn).safeIncreaseAllowance(router, currentAmount);

            // Build path
            address[] memory path = new address[](2);
            path[0] = swap.tokenIn;
            path[1] = swap.tokenOut;

            // Execute swap
            uint256[] memory amounts = IDexRouter(router).swapExactTokensForTokens(
                currentAmount,
                swap.minAmountOut,
                path,
                address(this),
                block.timestamp
            );

            currentAmount = amounts[amounts.length - 1];
        }

        // Repay flash loan
        uint256 repayAmount = params.loanAmount + fee;
        if (currentAmount < repayAmount) revert InsufficientProfit();

        uint256 profit = currentAmount - repayAmount;

        // Check minimum profit
        uint256 minProfitBps = Obfuscation.unscrambleUint(
            _scrambledMinProfit,
            PROFIT_SCRAMBLE_KEY
        );
        uint256 minProfit = (params.loanAmount * minProfitBps) / 10000;

        if (profit < minProfit) revert InsufficientProfit();

        // Repay to pool
        IERC20(params.loanToken).safeTransfer(msg.sender, repayAmount);

        emit Executed(keccak256(abi.encode(params)), profit);
    }

    // ============ Address Decoding ============

    function _decodePool(uint8 index) internal view returns (address) {
        bytes32 packed = index < 2 ? _encodedPools1 : _encodedPools2;
        uint8 subIndex = index % 2;

        address[4] memory pools = Obfuscation.decodeAddresses(
            _encodedPools1,
            _encodedPools2,
            XOR_KEY
        );

        return pools[index];
    }

    function _decodeRouter(uint8 index) internal view returns (address) {
        address[4] memory routers = Obfuscation.decodeAddresses(
            _encodedRouters1,
            _encodedRouters2,
            XOR_KEY
        );

        return routers[index];
    }

    function _isValidPool(address pool) internal view returns (bool) {
        address[4] memory pools = Obfuscation.decodeAddresses(
            _encodedPools1,
            _encodedPools2,
            XOR_KEY
        );

        for (uint256 i = 0; i < 4; i++) {
            if (pools[i] == pool) return true;
        }
        return false;
    }

    // ============ Anti-Bot Measures ============

    /**
     * @notice Require caller to be an EOA (Externally Owned Account)
     * @dev Blocks calls from other contracts
     */
    function _requireEOA() internal view {
        if (msg.sender != tx.origin) revert CodeSizeCheck();

        uint256 size;
        address sender = msg.sender;
        assembly {
            size := extcodesize(sender)
        }
        if (size > 0) revert CodeSizeCheck();
    }

    // ============ Admin Functions ============

    /**
     * @notice Add an executor using their hash
     * @dev Call Obfuscation.generateAccessHash off-chain to get hash
     * @param executorHash Hash of executor address + salt
     */
    function addExecutor(bytes32 executorHash) external {
        _addExecutorHash(executorHash);
    }

    /**
     * @notice Remove an executor
     */
    function removeExecutor(bytes32 executorHash) external {
        _removeExecutorHash(executorHash);
    }

    /**
     * @notice Transfer ownership
     * @param newOwnerHash Hash of new owner address + salt
     */
    function transferOwnership(bytes32 newOwnerHash) external {
        _transferOwnershipObfuscated(newOwnerHash);
    }

    /**
     * @notice Update minimum profit (owner only)
     * @param newMinProfitBps New minimum profit in basis points
     */
    function setMinProfit(uint256 newMinProfitBps) external onlyOwnerObfuscated {
        _scrambledMinProfit = Obfuscation.scrambleUint(newMinProfitBps, PROFIT_SCRAMBLE_KEY);
    }

    // ============ Helper for Off-Chain ============

    /**
     * @notice Encode addresses for storage (call off-chain)
     * @param addrs Array of 4 addresses to encode
     * @param key XOR key (use contract's XOR_KEY)
     * @return packed1 First encoded slot
     * @return packed2 Second encoded slot
     */
    function encodeAddressesHelper(
        address[4] memory addrs,
        bytes32 key
    ) external pure returns (bytes32 packed1, bytes32 packed2) {
        return Obfuscation.encodeAddresses(addrs, key);
    }

    /**
     * @notice Generate executor hash (call off-chain)
     * @param executor Address to authorize
     * @param salt Access control salt
     */
    function generateExecutorHashHelper(
        address executor,
        bytes32 salt
    ) external pure returns (bytes32) {
        return Obfuscation.generateAccessHash(executor, salt);
    }

    /**
     * @notice Generate commitment for reveal (call off-chain)
     */
    function generateCommitmentHelper(
        address sender,
        bytes memory data,
        bytes32 secret
    ) external pure returns (bytes32) {
        return Obfuscation.generateCommitment(sender, data, secret);
    }
}
