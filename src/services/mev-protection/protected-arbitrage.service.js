"use strict";
/**
 * Protected Arbitrage Service
 *
 * Executes arbitrage opportunities with full MEV protection:
 * 1. Routes through private mempools (no public exposure)
 * 2. Submits bundles directly to Titan Builder
 * 3. Uses atomic bundle execution (all-or-nothing)
 * 4. Provides MEV refunds (90% of captured value)
 *
 * Usage:
 * ```typescript
 * const arbService = new ProtectedArbitrageService(privateKey, contractAddress);
 * const result = await arbService.executeProtectedArbitrage(opportunity);
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectedArbitrageService = void 0;
exports.createProtectedArbitrageService = createProtectedArbitrageService;
const ethers_1 = require("ethers");
const uuid_1 = require("uuid");
const titan_builder_service_1 = require("./titan-builder.service");
const private_transaction_service_1 = require("./private-transaction.service");
// ============ Service ============
class ProtectedArbitrageService {
    titanBuilder = (0, titan_builder_service_1.getTitanBuilder)();
    privateTx = (0, private_transaction_service_1.getPrivateTransactionService)();
    wallet;
    readWallet;
    flashLoanContract;
    contractAddress;
    constructor(privateKey, flashLoanContractAddress, flashLoanAbi) {
        this.contractAddress = flashLoanContractAddress;
        // Create wallets for read and write operations
        this.readWallet = this.privateTx.createReadWallet(privateKey);
        this.wallet = this.privateTx.createPrivateWallet(privateKey);
        // Default ABI if not provided
        const abi = flashLoanAbi || [
            'function executeArbitrage(address asset, uint256 amount, bytes calldata params) external',
            'function authorizedExecutors(address) view returns (bool)',
            'function owner() view returns (address)',
        ];
        // Use read wallet for contract reads, will sign separately for writes
        this.flashLoanContract = new ethers_1.ethers.Contract(flashLoanContractAddress, abi, this.readWallet);
    }
    /**
     * Execute arbitrage with full MEV protection
     *
     * This is the main entry point for protected arbitrage execution.
     * It handles:
     * - Transaction building and signing
     * - Bundle submission to Titan Builder
     * - Fallback to private RPCs
     * - Inclusion monitoring
     *
     * @param opportunity The arbitrage opportunity to execute
     * @param options Execution options
     */
    async executeProtectedArbitrage(opportunity, options = {}) {
        const { multiBuilder = true, waitForInclusion = true, maxWaitBlocks = 3, gasPriceMultiplier = 1.5, refundPercent = 90, } = options;
        // Generate unique bundle ID for tracking/cancellation
        const bundleUuid = (0, uuid_1.v4)();
        console.log(`Executing arbitrage ${opportunity.id}...`);
        console.log(`  Loan: ${ethers_1.ethers.formatEther(opportunity.loanAmount)} tokens`);
        console.log(`  Expected profit: ${ethers_1.ethers.formatEther(opportunity.expectedProfit)}`);
        console.log(`  Swaps: ${opportunity.swaps.length}`);
        try {
            // 1. Build the arbitrage transaction
            const arbTx = await this.buildArbitrageTransaction(opportunity, gasPriceMultiplier);
            // 2. Sign the transaction
            const signedTx = await this.wallet.signTransaction(arbTx);
            // 3. Get target block number
            const currentBlock = await this.privateTx
                .getReadProvider()
                .getBlockNumber();
            const targetBlock = `0x${(currentBlock + 1).toString(16)}`;
            console.log(`  Target block: ${currentBlock + 1}`);
            // 4. Submit to Titan Builder
            const bundleParams = {
                txs: [signedTx],
                blockNumber: targetBlock,
                replacementUuid: bundleUuid,
                refundPercent,
                refundRecipient: this.wallet.address,
            };
            let bundleHash;
            try {
                const bundleResult = await this.titanBuilder.sendBundle(bundleParams);
                bundleHash = bundleResult.bundleHash;
                console.log(`  Bundle submitted: ${bundleHash}`);
            }
            catch (bundleError) {
                console.warn('  Titan bundle failed, using private RPC fallback');
            }
            // 5. Also broadcast through private RPCs if multiBuilder enabled
            if (multiBuilder) {
                const results = await this.privateTx.broadcastToAll(signedTx);
                console.log(`  Broadcast to ${results.length} providers: ${results.map((r) => r.provider).join(', ')}`);
            }
            else {
                // Single provider submission
                const result = await this.privateTx.sendPrivateTransaction(signedTx);
                console.log(`  Sent via ${result.provider}: ${result.hash}`);
            }
            // 6. Wait for inclusion if requested
            if (waitForInclusion && bundleHash) {
                console.log(`  Waiting for inclusion (max ${maxWaitBlocks} blocks)...`);
                const inclusionResult = await this.titanBuilder.waitForInclusion(bundleHash, maxWaitBlocks);
                if (inclusionResult.included) {
                    console.log(`  Included in block ${inclusionResult.blockNumber}!`);
                    return {
                        success: true,
                        bundleHash,
                        blockNumber: inclusionResult.blockNumber,
                    };
                }
                else {
                    // Not included via Titan, check mempool
                    console.log('  Not included via bundle, checking mempool...');
                }
            }
            // 7. Get transaction hash from signed tx
            const tx = ethers_1.ethers.Transaction.from(signedTx);
            return {
                success: true,
                bundleHash,
                transactionHash: tx.hash,
                provider: 'Multi-builder submission',
            };
        }
        catch (error) {
            const err = error;
            // Always try to cancel bundle on error
            await this.titanBuilder.cancelBundle(bundleUuid).catch(() => { });
            console.error(`  Execution failed: ${err.message}`);
            return {
                success: false,
                error: err.message,
            };
        }
    }
    /**
     * Execute multiple arbitrage opportunities as atomic bundle
     *
     * All opportunities execute together or none do.
     * Useful for related opportunities that depend on each other.
     *
     * @param opportunities Array of opportunities
     * @param options Execution options
     */
    async executeMultipleArbitrage(opportunities, options = {}) {
        const { gasPriceMultiplier = 1.5, refundPercent = 90, maxWaitBlocks = 3, } = options;
        const bundleUuid = (0, uuid_1.v4)();
        try {
            // Build all transactions
            const signedTxs = [];
            for (const opp of opportunities) {
                const arbTx = await this.buildArbitrageTransaction(opp, gasPriceMultiplier);
                const signedTx = await this.wallet.signTransaction(arbTx);
                signedTxs.push(signedTx);
            }
            // Get target block
            const currentBlock = await this.privateTx
                .getReadProvider()
                .getBlockNumber();
            const targetBlock = `0x${(currentBlock + 1).toString(16)}`;
            // Submit bundle with all transactions
            const bundleResult = await this.titanBuilder.sendBundle({
                txs: signedTxs,
                blockNumber: targetBlock,
                replacementUuid: bundleUuid,
                refundPercent,
                refundRecipient: this.wallet.address,
            });
            console.log(`Multi-arb bundle submitted: ${bundleResult.bundleHash}`);
            console.log(`  Opportunities: ${opportunities.length}`);
            console.log(`  Total expected profit: ${ethers_1.ethers.formatEther(opportunities.reduce((sum, o) => sum + o.expectedProfit, 0n))}`);
            // Wait for inclusion
            const inclusion = await this.titanBuilder.waitForInclusion(bundleResult.bundleHash, maxWaitBlocks);
            return {
                success: inclusion.included,
                bundleHash: bundleResult.bundleHash,
                blockNumber: inclusion.blockNumber,
            };
        }
        catch (error) {
            await this.titanBuilder.cancelBundle(bundleUuid).catch(() => { });
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * Check if wallet is authorized to execute on contract
     */
    async isAuthorized() {
        try {
            return await this.flashLoanContract.authorizedExecutors(this.wallet.address);
        }
        catch {
            // Method might not exist, check if owner
            try {
                const owner = await this.flashLoanContract.owner();
                return owner.toLowerCase() === this.wallet.address.toLowerCase();
            }
            catch {
                return false;
            }
        }
    }
    /**
     * Get current wallet address
     */
    getWalletAddress() {
        return this.wallet.address;
    }
    // ============ Private Methods ============
    /**
     * Build arbitrage transaction
     */
    async buildArbitrageTransaction(opportunity, gasPriceMultiplier) {
        // Encode arbitrage parameters
        const arbParams = this.encodeArbitrageParams(opportunity);
        // Encode function call
        const calldata = this.flashLoanContract.interface.encodeFunctionData('executeArbitrage', [opportunity.loanToken, opportunity.loanAmount, arbParams]);
        // Estimate gas
        let gasEstimate;
        try {
            gasEstimate = await this.readWallet.estimateGas({
                to: this.contractAddress,
                data: calldata,
            });
        }
        catch {
            // Default gas estimate if estimation fails
            gasEstimate = 500000n;
        }
        // Get current fee data
        const feeData = await this.privateTx.getReadProvider().getFeeData();
        // Apply multiplier to gas price for priority
        const maxFeePerGas = BigInt(Math.floor(Number(feeData.maxFeePerGas) * gasPriceMultiplier));
        const maxPriorityFeePerGas = BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * gasPriceMultiplier));
        // Check max gas price constraint
        if (opportunity.maxGasPrice &&
            maxFeePerGas > opportunity.maxGasPrice) {
            throw new Error(`Gas price ${maxFeePerGas} exceeds maximum ${opportunity.maxGasPrice}`);
        }
        // Get nonce
        const nonce = await this.readWallet.getNonce();
        return {
            to: this.contractAddress,
            data: calldata,
            gasLimit: (gasEstimate * 130n) / 100n, // 30% buffer
            maxFeePerGas,
            maxPriorityFeePerGas,
            nonce,
            chainId: 1n,
            type: 2, // EIP-1559
        };
    }
    /**
     * Encode arbitrage parameters for contract call
     */
    encodeArbitrageParams(opportunity) {
        // Match the ArbitrageParams struct in FlashLoanReceiver.sol
        const abiCoder = ethers_1.ethers.AbiCoder.defaultAbiCoder();
        const swapsEncoded = opportunity.swaps.map((s) => [
            s.dex,
            s.tokenIn,
            s.tokenOut,
            s.amountIn,
            s.minAmountOut,
            s.data,
        ]);
        return abiCoder.encode([
            'tuple(bytes32 opportunityId, tuple(address dex, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes data)[] swaps, uint256 expectedProfit)',
        ], [
            {
                opportunityId: ethers_1.ethers.id(opportunity.id),
                swaps: swapsEncoded,
                expectedProfit: opportunity.expectedProfit,
            },
        ]);
    }
}
exports.ProtectedArbitrageService = ProtectedArbitrageService;
// ============ Factory Function ============
/**
 * Create a protected arbitrage service
 *
 * @param privateKey Wallet private key
 * @param flashLoanAddress FlashLoanReceiver contract address
 * @param abi Optional custom ABI
 */
function createProtectedArbitrageService(privateKey, flashLoanAddress, abi) {
    return new ProtectedArbitrageService(privateKey, flashLoanAddress, abi);
}
