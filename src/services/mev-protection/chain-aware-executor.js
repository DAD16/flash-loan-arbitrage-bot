"use strict";
/**
 * Chain-Aware Arbitrage Executor
 *
 * Automatically selects the best execution strategy based on chain:
 *
 * ETHEREUM (Chain 1):
 * - Titan Builder bundles (when enabled)
 * - Flashbots Protect fallback
 * - Standard contracts (FlashLoanReceiver.sol)
 *
 * BSC (Chain 56) & OTHER CHAINS:
 * - Obfuscated contracts (FlashLoanReceiverObfuscated.sol)
 * - Commit-reveal pattern for time-sensitive trades
 * - Standard RPC (no private mempool available)
 *
 * Usage:
 * ```typescript
 * const executor = new ChainAwareExecutor(config);
 *
 * // Toggle Titan Builder
 * executor.setTitanBuilderEnabled(true);
 *
 * // Execute on any chain
 * await executor.executeArbitrage(opportunity, ChainId.BSC);
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainAwareExecutor = void 0;
exports.createChainAwareExecutor = createChainAwareExecutor;
const ethers_1 = require("ethers");
const uuid_1 = require("uuid");
const mev_protection_manager_1 = require("./mev-protection-manager");
const titan_builder_service_1 = require("./titan-builder.service");
// Command codes matching the obfuscated contract
const COMMANDS = {
    EXECUTE: 0x01,
    COMMIT: 0x02,
    REVEAL_EXECUTE: 0x03,
    SET_POOL: 0x10,
    SET_ROUTER: 0x11,
    WITHDRAW: 0x20,
};
// ============ Chain-Aware Executor ============
class ChainAwareExecutor {
    config;
    mevManager = (0, mev_protection_manager_1.getMEVProtectionManager)();
    titanBuilder = (0, titan_builder_service_1.getTitanBuilder)();
    wallets = new Map();
    providers = new Map();
    // Standard ABI for non-obfuscated contract
    standardABI = [
        'function executeArbitrage(address asset, uint256 amount, bytes calldata params) external',
    ];
    constructor(config) {
        this.config = config;
        // Apply MEV protection settings
        if (config.mevProtection) {
            const manager = this.mevManager;
            if (config.mevProtection.titanBuilderEnabled !== undefined) {
                manager.setTitanBuilderEnabled(config.mevProtection.titanBuilderEnabled);
            }
            if (config.mevProtection.flashbotsEnabled !== undefined) {
                manager.setFlashbotsEnabled(config.mevProtection.flashbotsEnabled);
            }
            if (config.mevProtection.verbose !== undefined) {
                manager.setVerbose(config.mevProtection.verbose);
            }
        }
        // Initialize wallets for each configured chain
        for (const [chainIdStr, contractConfig] of Object.entries(config.contracts)) {
            const chainId = Number(chainIdStr);
            const chainConfig = mev_protection_manager_1.CHAIN_CONFIGS[chainId];
            if (chainConfig) {
                const provider = new ethers_1.ethers.JsonRpcProvider(chainConfig.rpcUrl);
                const wallet = new ethers_1.ethers.Wallet(config.privateKey, provider);
                this.providers.set(chainId, provider);
                this.wallets.set(chainId, wallet);
            }
        }
    }
    // ============ Toggle Controls ============
    /**
     * Enable or disable Titan Builder for Ethereum
     */
    setTitanBuilderEnabled(enabled) {
        this.mevManager.setTitanBuilderEnabled(enabled);
        console.log(`[ChainAwareExecutor] Titan Builder: ${enabled ? 'ON' : 'OFF'}`);
    }
    /**
     * Check if Titan Builder is enabled
     */
    isTitanBuilderEnabled() {
        return this.mevManager.getConfig().titanBuilderEnabled;
    }
    /**
     * Enable or disable commit-reveal for BSC
     * (Always recommended for BSC due to no private mempool)
     */
    useCommitReveal = true;
    setCommitRevealEnabled(enabled) {
        this.useCommitReveal = enabled;
        console.log(`[ChainAwareExecutor] Commit-Reveal: ${enabled ? 'ON' : 'OFF'}`);
    }
    // ============ Main Execution ============
    /**
     * Execute arbitrage with chain-appropriate strategy
     */
    async executeArbitrage(opportunity) {
        const { chainId } = opportunity;
        const contractConfig = this.config.contracts[chainId];
        if (!contractConfig) {
            return {
                success: false,
                chainId,
                method: 'direct',
                error: `No contract configured for chain ${chainId}`,
            };
        }
        console.log(`\n[ChainAwareExecutor] Executing on ${mev_protection_manager_1.CHAIN_CONFIGS[chainId]?.name || chainId}`);
        console.log(`  Opportunity: ${opportunity.id}`);
        console.log(`  Loan: ${ethers_1.ethers.formatEther(opportunity.loanAmount)} tokens`);
        console.log(`  Expected profit: ${ethers_1.ethers.formatEther(opportunity.expectedProfit)}`);
        // Route based on chain and contract type
        if (chainId === mev_protection_manager_1.ChainId.ETHEREUM && !contractConfig.isObfuscated) {
            return this.executeEthereum(opportunity);
        }
        else if (contractConfig.isObfuscated) {
            return this.executeObfuscated(opportunity);
        }
        else {
            return this.executeDirect(opportunity);
        }
    }
    // ============ Ethereum Execution (Titan Builder) ============
    async executeEthereum(opportunity) {
        const wallet = this.wallets.get(mev_protection_manager_1.ChainId.ETHEREUM);
        const provider = this.providers.get(mev_protection_manager_1.ChainId.ETHEREUM);
        const contractConfig = this.config.contracts[mev_protection_manager_1.ChainId.ETHEREUM];
        try {
            // Build transaction
            const contract = new ethers_1.ethers.Contract(contractConfig.flashLoanReceiver, this.standardABI, wallet);
            const params = this.encodeStandardParams(opportunity);
            const txData = contract.interface.encodeFunctionData('executeArbitrage', [
                opportunity.loanToken,
                opportunity.loanAmount,
                params,
            ]);
            // Estimate gas and build transaction
            const feeData = await provider.getFeeData();
            const nonce = await wallet.getNonce();
            const tx = {
                to: contractConfig.flashLoanReceiver,
                data: txData,
                gasLimit: 500000n,
                maxFeePerGas: feeData.maxFeePerGas * 2n,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * 2n,
                nonce,
                chainId: 1n,
                type: 2,
            };
            const signedTx = await wallet.signTransaction(tx);
            // Use Titan Builder if enabled
            if (this.isTitanBuilderEnabled()) {
                const currentBlock = await provider.getBlockNumber();
                const targetBlock = `0x${(currentBlock + 1).toString(16)}`;
                const bundleResult = await this.titanBuilder.sendBundle({
                    txs: [signedTx],
                    blockNumber: targetBlock,
                    replacementUuid: (0, uuid_1.v4)(),
                    refundPercent: 90,
                    refundRecipient: wallet.address,
                });
                console.log(`  Titan bundle: ${bundleResult.bundleHash}`);
                // Wait for inclusion
                const inclusion = await this.titanBuilder.waitForInclusion(bundleResult.bundleHash, 3);
                return {
                    success: inclusion.included,
                    chainId: mev_protection_manager_1.ChainId.ETHEREUM,
                    method: 'titan-bundle',
                    bundleHash: bundleResult.bundleHash,
                    blockNumber: inclusion.blockNumber,
                };
            }
            // Fallback to MEV protection manager
            const result = await this.mevManager.executeTransaction(signedTx, mev_protection_manager_1.ChainId.ETHEREUM);
            return {
                success: result.success,
                chainId: mev_protection_manager_1.ChainId.ETHEREUM,
                method: 'private-rpc',
                transactionHash: result.hash,
                error: result.error,
            };
        }
        catch (error) {
            return {
                success: false,
                chainId: mev_protection_manager_1.ChainId.ETHEREUM,
                method: 'titan-bundle',
                error: error.message,
            };
        }
    }
    // ============ Obfuscated Contract Execution (BSC/Other) ============
    async executeObfuscated(opportunity) {
        const { chainId } = opportunity;
        const wallet = this.wallets.get(chainId);
        const provider = this.providers.get(chainId);
        const contractConfig = this.config.contracts[chainId];
        // Use commit-reveal for additional protection
        if (this.useCommitReveal) {
            return this.executeWithCommitReveal(opportunity);
        }
        // Direct execution (less protected but faster)
        return this.executeObfuscatedDirect(opportunity);
    }
    /**
     * Execute with commit-reveal pattern
     * Phase 1: Submit commitment (hides intent)
     * Phase 2: Wait for blocks
     * Phase 3: Reveal and execute
     */
    async executeWithCommitReveal(opportunity) {
        const { chainId } = opportunity;
        const wallet = this.wallets.get(chainId);
        const provider = this.providers.get(chainId);
        const contractConfig = this.config.contracts[chainId];
        console.log(`  Using commit-reveal pattern...`);
        try {
            // Generate secret
            const secret = ethers_1.ethers.hexlify(ethers_1.ethers.randomBytes(32));
            // Encode execution params
            const paramsData = this.encodeObfuscatedParams(opportunity);
            // Generate commitment hash (sender + data + secret)
            const commitmentHash = ethers_1.ethers.keccak256(ethers_1.ethers.solidityPacked(['address', 'bytes', 'bytes32'], [wallet.address, paramsData, secret]));
            // Phase 1: Submit commitment
            const commitCalldata = ethers_1.ethers.concat([
                commitmentHash,
                Uint8Array.from([COMMANDS.COMMIT]),
            ]);
            const commitTx = await wallet.sendTransaction({
                to: contractConfig.flashLoanReceiver,
                data: commitCalldata,
                gasLimit: 100000n,
            });
            console.log(`  Commitment tx: ${commitTx.hash}`);
            const commitReceipt = await commitTx.wait();
            // Extract commitment ID from event
            // For simplicity, we'll compute it the same way the contract does
            const commitmentId = ethers_1.ethers.keccak256(ethers_1.ethers.solidityPacked(['bytes32', 'uint256', 'address'], [commitmentHash, commitReceipt.blockNumber, wallet.address]));
            console.log(`  Commitment ID: ${commitmentId}`);
            // Phase 2: Wait for minimum delay (e.g., 2 blocks)
            console.log(`  Waiting for reveal window...`);
            await this.waitBlocks(provider, 2);
            // Phase 3: Reveal and execute
            const revealCalldata = ethers_1.ethers.concat([
                commitmentId,
                secret,
                paramsData,
                Uint8Array.from([COMMANDS.REVEAL_EXECUTE]),
            ]);
            const revealTx = await wallet.sendTransaction({
                to: contractConfig.flashLoanReceiver,
                data: revealCalldata,
                gasLimit: 500000n,
            });
            console.log(`  Reveal tx: ${revealTx.hash}`);
            const revealReceipt = await revealTx.wait();
            return {
                success: revealReceipt.status === 1,
                chainId,
                method: 'commit-reveal',
                transactionHash: revealTx.hash,
                commitmentId,
                blockNumber: revealReceipt.blockNumber,
                gasUsed: revealReceipt.gasUsed,
            };
        }
        catch (error) {
            return {
                success: false,
                chainId,
                method: 'commit-reveal',
                error: error.message,
            };
        }
    }
    /**
     * Direct execution on obfuscated contract (faster but less protected)
     */
    async executeObfuscatedDirect(opportunity) {
        const { chainId } = opportunity;
        const wallet = this.wallets.get(chainId);
        const contractConfig = this.config.contracts[chainId];
        console.log(`  Direct execution (no commit-reveal)...`);
        console.warn(`  WARNING: No commit-reveal protection on chain ${chainId}!`);
        try {
            const paramsData = this.encodeObfuscatedParams(opportunity);
            // Add command byte at end
            const calldata = ethers_1.ethers.concat([
                paramsData,
                Uint8Array.from([COMMANDS.EXECUTE]),
            ]);
            const tx = await wallet.sendTransaction({
                to: contractConfig.flashLoanReceiver,
                data: calldata,
                gasLimit: 500000n,
            });
            console.log(`  TX: ${tx.hash}`);
            const receipt = await tx.wait();
            return {
                success: receipt.status === 1,
                chainId,
                method: 'direct',
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed,
            };
        }
        catch (error) {
            return {
                success: false,
                chainId,
                method: 'direct',
                error: error.message,
            };
        }
    }
    /**
     * Standard execution (non-obfuscated, non-Ethereum)
     */
    async executeDirect(opportunity) {
        const { chainId } = opportunity;
        const wallet = this.wallets.get(chainId);
        const contractConfig = this.config.contracts[chainId];
        try {
            const contract = new ethers_1.ethers.Contract(contractConfig.flashLoanReceiver, this.standardABI, wallet);
            const params = this.encodeStandardParams(opportunity);
            const tx = await contract.executeArbitrage(opportunity.loanToken, opportunity.loanAmount, params);
            console.log(`  TX: ${tx.hash}`);
            const receipt = await tx.wait();
            return {
                success: receipt.status === 1,
                chainId,
                method: 'direct',
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed,
            };
        }
        catch (error) {
            return {
                success: false,
                chainId,
                method: 'direct',
                error: error.message,
            };
        }
    }
    // ============ Encoding Helpers ============
    encodeStandardParams(opportunity) {
        const abiCoder = ethers_1.ethers.AbiCoder.defaultAbiCoder();
        const swapsEncoded = opportunity.swaps.map((s) => [
            s.dex,
            s.tokenIn,
            s.tokenOut,
            s.amountIn,
            s.minAmountOut,
            s.data || '0x',
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
    encodeObfuscatedParams(opportunity) {
        const abiCoder = ethers_1.ethers.AbiCoder.defaultAbiCoder();
        // Match the ExecutionParams struct in FlashLoanReceiverObfuscated
        const swapsEncoded = opportunity.swaps.map((s) => [
            s.routerIndex || 0,
            s.tokenIn,
            s.tokenOut,
            s.amountIn,
            s.minAmountOut,
        ]);
        return abiCoder.encode([
            'tuple(uint8 poolIndex, address loanToken, uint256 loanAmount, tuple(uint8 routerIndex, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)[] swaps, uint256 expectedProfit)',
        ], [
            {
                poolIndex: opportunity.poolIndex || 0,
                loanToken: opportunity.loanToken,
                loanAmount: opportunity.loanAmount,
                swaps: swapsEncoded,
                expectedProfit: opportunity.expectedProfit,
            },
        ]);
    }
    // ============ Utilities ============
    async waitBlocks(provider, blocks) {
        const startBlock = await provider.getBlockNumber();
        const targetBlock = startBlock + blocks;
        while ((await provider.getBlockNumber()) < targetBlock) {
            await new Promise((resolve) => setTimeout(resolve, 3000)); // BSC ~3s blocks
        }
    }
    /**
     * Get wallet address for a chain
     */
    getWalletAddress(chainId) {
        return this.wallets.get(chainId)?.address;
    }
    /**
     * Get current balance on a chain
     */
    async getBalance(chainId, token) {
        const wallet = this.wallets.get(chainId);
        const provider = this.providers.get(chainId);
        if (!wallet || !provider)
            return 0n;
        if (!token) {
            return await provider.getBalance(wallet.address);
        }
        const erc20 = new ethers_1.ethers.Contract(token, ['function balanceOf(address) view returns (uint256)'], provider);
        return await erc20.balanceOf(wallet.address);
    }
}
exports.ChainAwareExecutor = ChainAwareExecutor;
// ============ Factory ============
function createChainAwareExecutor(config) {
    return new ChainAwareExecutor(config);
}
