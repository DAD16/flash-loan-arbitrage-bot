/**
 * KEYMAKER - Wallet Manager
 *
 * HD wallet derivation, balance monitoring, and auto-funding for multi-chain operations.
 *
 * Wallet Hierarchy:
 * ├── Master Wallet (Cold Storage - Manual)
 * │   └── Funds distribution wallet
 * │
 * ├── Executor Wallets (Hot - Per Contract)
 * │   ├── BSC-Executor-1 → FlashLoanReceiver (BSC)
 * │   ├── ETH-Executor-1 → FlashLoanReceiver (ETH)
 * │   └── ...
 * │
 * └── Gas Reserve Wallets (Per Chain)
 *     ├── BSC-Gas-Reserve (holds BNB for refueling)
 *     └── ETH-Gas-Reserve (holds ETH for refueling)
 */

import { ethers, HDNodeWallet, JsonRpcProvider, formatEther, parseEther } from 'ethers';
import { randomUUID } from 'crypto';
import { AgentLogger } from '@matrix/shared';
import { WalletDatabase } from './database.js';
import { Keymaker } from './vault.js';
import type {
  ManagedWallet,
  WalletBalance,
  WalletAssignment,
  FundingTransaction,
  WalletManagerConfig,
  WalletGenerationResult,
  WalletSummary,
  ChainId,
  WalletRole,
  ChainConfig,
} from './types.js';

// BIP-44 derivation path template: m/44'/60'/0'/0/index
// 60' is the coin type for Ethereum
const BASE_DERIVATION_PATH = "m/44'/60'/0'/0";

// Default chain configurations
const DEFAULT_CHAINS: ChainConfig[] = [
  {
    chainId: 1,
    name: 'Ethereum',
    symbol: 'ETH',
    rpcUrl: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    decimals: 18,
  },
  {
    chainId: 56,
    name: 'BSC',
    symbol: 'BNB',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    explorerUrl: 'https://bscscan.com',
    decimals: 18,
  },
  {
    chainId: 137,
    name: 'Polygon',
    symbol: 'MATIC',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    decimals: 18,
  },
  {
    chainId: 42161,
    name: 'Arbitrum',
    symbol: 'ETH',
    rpcUrl: process.env.ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    decimals: 18,
  },
  {
    chainId: 11155111,
    name: 'Sepolia',
    symbol: 'ETH',
    rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
    explorerUrl: 'https://sepolia.etherscan.io',
    decimals: 18,
  },
];

// Default thresholds (in wei)
const DEFAULT_LOW_BALANCE_THRESHOLDS: Record<ChainId, string> = {
  1: parseEther('0.05').toString(),      // 0.05 ETH
  56: parseEther('0.1').toString(),       // 0.1 BNB
  137: parseEther('5').toString(),        // 5 MATIC
  42161: parseEther('0.01').toString(),   // 0.01 ETH on Arbitrum
  10: parseEther('0.01').toString(),      // 0.01 ETH on Optimism
  8453: parseEther('0.01').toString(),    // 0.01 ETH on Base
  11155111: parseEther('0.1').toString(), // 0.1 ETH on Sepolia
};

const DEFAULT_AUTO_FUND_AMOUNTS: Record<ChainId, string> = {
  1: parseEther('0.1').toString(),        // 0.1 ETH
  56: parseEther('0.2').toString(),       // 0.2 BNB
  137: parseEther('10').toString(),       // 10 MATIC
  42161: parseEther('0.02').toString(),   // 0.02 ETH on Arbitrum
  10: parseEther('0.02').toString(),      // 0.02 ETH on Optimism
  8453: parseEther('0.02').toString(),    // 0.02 ETH on Base
  11155111: parseEther('0.2').toString(), // 0.2 ETH on Sepolia
};

export class WalletManager {
  private logger: AgentLogger;
  private db: WalletDatabase;
  private vault: Keymaker;
  private config: WalletManagerConfig;
  private providers: Map<ChainId, JsonRpcProvider>;
  private masterNode: HDNodeWallet | null = null;
  private walletIndex: number = 0;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<WalletManagerConfig>, vault: Keymaker) {
    this.logger = new AgentLogger('KEYMAKER-WALLET');
    this.vault = vault;

    this.config = {
      dbPath: config.dbPath || './data/wallets.db',
      masterSeedEnvVar: config.masterSeedEnvVar || 'MASTER_SEED_PHRASE',
      chains: config.chains || DEFAULT_CHAINS,
      lowBalanceThresholds: config.lowBalanceThresholds || DEFAULT_LOW_BALANCE_THRESHOLDS,
      autoFundAmounts: config.autoFundAmounts || DEFAULT_AUTO_FUND_AMOUNTS,
      checkIntervalMs: config.checkIntervalMs || 60000, // 1 minute
    };

    this.db = new WalletDatabase(this.config.dbPath);
    this.providers = new Map();

    // Initialize providers for each chain
    for (const chain of this.config.chains) {
      this.providers.set(chain.chainId, new JsonRpcProvider(chain.rpcUrl));
    }

    this.logger.info('WalletManager initialized');
  }

  /**
   * Initialize the master HD node from seed phrase
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing master HD node...');

    const seedPhrase = process.env[this.config.masterSeedEnvVar];
    if (!seedPhrase) {
      throw new Error(`Master seed phrase not found in env var: ${this.config.masterSeedEnvVar}`);
    }

    // Validate mnemonic
    if (!ethers.Mnemonic.isValidMnemonic(seedPhrase)) {
      throw new Error('Invalid mnemonic seed phrase');
    }

    // Create master HD node
    this.masterNode = ethers.HDNodeWallet.fromPhrase(seedPhrase);

    // Get highest existing wallet index from DB
    const existingWallets = this.db.getAllWallets();
    if (existingWallets.length > 0) {
      const maxIndex = Math.max(
        ...existingWallets.map((w) => {
          const match = w.derivationPath.match(/\/(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
      );
      this.walletIndex = maxIndex + 1;
    }

    this.logger.info(`Master node initialized. Next wallet index: ${this.walletIndex}`);
  }

  // ============================================
  // Wallet Generation
  // ============================================

  /**
   * Generate a new wallet for a specific chain and role
   */
  async generateWallet(
    chain: ChainId,
    role: WalletRole,
    label: string
  ): Promise<WalletGenerationResult> {
    if (!this.masterNode) {
      throw new Error('WalletManager not initialized');
    }

    const derivationPath = `${BASE_DERIVATION_PATH}/${this.walletIndex}`;
    const childNode = this.masterNode.derivePath(derivationPath);

    const wallet: ManagedWallet = {
      id: randomUUID(),
      address: childNode.address.toLowerCase(),
      chain,
      role,
      label,
      derivationPath,
      createdAt: Date.now(),
      lastFundedAt: null,
      isActive: true,
    };

    // Store in database
    this.db.createWallet(wallet);

    // Store private key in vault
    await this.vault.storeSecret(`wallets/${wallet.id}`, {
      address: wallet.address,
      privateKey: childNode.privateKey,
      chainIds: [chain],
    });

    this.walletIndex++;
    this.logger.info(`Generated wallet: ${label} (${wallet.address}) for chain ${chain}`);

    return {
      wallet,
      privateKey: childNode.privateKey,
    };
  }

  /**
   * Generate executor wallet for a specific chain
   */
  async generateExecutorWallet(chain: ChainId, label?: string): Promise<WalletGenerationResult> {
    const chainConfig = this.config.chains.find((c) => c.chainId === chain);
    const chainName = chainConfig?.name || `Chain-${chain}`;
    const walletLabel = label || `${chainName}-Executor-${Date.now()}`;
    return this.generateWallet(chain, 'executor', walletLabel);
  }

  /**
   * Generate gas reserve wallet for a specific chain
   */
  async generateGasReserveWallet(chain: ChainId): Promise<WalletGenerationResult> {
    const chainConfig = this.config.chains.find((c) => c.chainId === chain);
    const chainName = chainConfig?.name || `Chain-${chain}`;
    return this.generateWallet(chain, 'gas_reserve', `${chainName}-Gas-Reserve`);
  }

  // ============================================
  // Balance Monitoring
  // ============================================

  /**
   * Get balance for a specific wallet
   */
  async getWalletBalance(walletId: string): Promise<WalletBalance | null> {
    const wallet = this.db.getWallet(walletId);
    if (!wallet) return null;

    const provider = this.providers.get(wallet.chain);
    if (!provider) {
      throw new Error(`No provider configured for chain ${wallet.chain}`);
    }

    const chainConfig = this.config.chains.find((c) => c.chainId === wallet.chain);
    const balanceWei = await provider.getBalance(wallet.address);
    const threshold = BigInt(this.config.lowBalanceThresholds[wallet.chain] || '0');

    // Update cached balance in DB
    this.db.updateBalance(walletId, balanceWei.toString());

    return {
      walletId,
      address: wallet.address,
      chain: wallet.chain,
      balanceWei: balanceWei.toString(),
      balanceFormatted: formatEther(balanceWei),
      symbol: chainConfig?.symbol || 'ETH',
      updatedAt: Date.now(),
      isLow: balanceWei < threshold,
    };
  }

  /**
   * Get balances for all active wallets
   */
  async getAllBalances(): Promise<WalletBalance[]> {
    const wallets = this.db.getAllWallets();
    const balances: WalletBalance[] = [];

    for (const wallet of wallets) {
      try {
        const balance = await this.getWalletBalance(wallet.id);
        if (balance) balances.push(balance);
      } catch (error) {
        this.logger.error(`Failed to get balance for ${wallet.address}`, { error: error as Error });
      }
    }

    return balances;
  }

  /**
   * Get wallets with low balance
   */
  async getLowBalanceWallets(): Promise<WalletBalance[]> {
    const balances = await this.getAllBalances();
    return balances.filter((b) => b.isLow);
  }

  // ============================================
  // Auto-Funding
  // ============================================

  /**
   * Fund a wallet from the gas reserve
   */
  async fundWallet(
    targetWalletId: string,
    amountWei?: string
  ): Promise<FundingTransaction | null> {
    const targetWallet = this.db.getWallet(targetWalletId);
    if (!targetWallet) {
      throw new Error(`Target wallet not found: ${targetWalletId}`);
    }

    // Find gas reserve wallet for this chain
    const gasReserve = this.db.getGasReserveWallet(targetWallet.chain);
    if (!gasReserve) {
      this.logger.warn(`No gas reserve wallet for chain ${targetWallet.chain}`);
      return null;
    }

    const amount = amountWei || this.config.autoFundAmounts[targetWallet.chain];
    if (!amount) {
      throw new Error(`No auto-fund amount configured for chain ${targetWallet.chain}`);
    }

    // Get gas reserve private key from vault
    const credentials = await this.vault.getWalletCredentials(gasReserve.id);
    const provider = this.providers.get(targetWallet.chain);
    if (!provider) {
      throw new Error(`No provider for chain ${targetWallet.chain}`);
    }

    const signer = new ethers.Wallet(credentials.privateKey, provider);

    // Check gas reserve has enough balance
    const reserveBalance = await provider.getBalance(gasReserve.address);
    const amountBigInt = BigInt(amount);
    if (reserveBalance < amountBigInt) {
      this.logger.warn(
        `Gas reserve ${gasReserve.address} has insufficient balance: ${formatEther(reserveBalance)}`
      );
      return null;
    }

    // Send funding transaction
    const txId = randomUUID();
    const fundingTx: FundingTransaction = {
      id: txId,
      fromWalletId: gasReserve.id,
      toWalletId: targetWalletId,
      chain: targetWallet.chain,
      amountWei: amount,
      txHash: '',
      status: 'pending',
      createdAt: Date.now(),
      confirmedAt: null,
    };

    try {
      const tx = await signer.sendTransaction({
        to: targetWallet.address,
        value: amountBigInt,
      });

      fundingTx.txHash = tx.hash;
      this.db.createFundingTransaction(fundingTx);

      this.logger.info(
        `Funding tx sent: ${tx.hash} (${formatEther(amountBigInt)} to ${targetWallet.address})`
      );

      // Wait for confirmation in background
      tx.wait().then((receipt) => {
        if (receipt && receipt.status === 1) {
          this.db.updateFundingTransactionStatus(txId, 'confirmed', Date.now());
          this.db.updateWalletLastFunded(targetWalletId, Date.now());
          this.logger.info(`Funding tx confirmed: ${tx.hash}`);
        } else {
          this.db.updateFundingTransactionStatus(txId, 'failed');
          this.logger.error(`Funding tx failed: ${tx.hash}`);
        }
      });

      return fundingTx;
    } catch (error) {
      this.logger.error('Funding transaction failed', { error: error as Error });
      fundingTx.status = 'failed';
      this.db.createFundingTransaction(fundingTx);
      return fundingTx;
    }
  }

  /**
   * Auto-fund all low balance wallets
   */
  async autoFundLowBalanceWallets(): Promise<FundingTransaction[]> {
    const lowBalanceWallets = await this.getLowBalanceWallets();
    const transactions: FundingTransaction[] = [];

    for (const balance of lowBalanceWallets) {
      // Skip gas reserve wallets (they need manual funding)
      const wallet = this.db.getWallet(balance.walletId);
      if (wallet?.role === 'gas_reserve') continue;

      try {
        const tx = await this.fundWallet(balance.walletId);
        if (tx) transactions.push(tx);
      } catch (error) {
        this.logger.error(`Failed to auto-fund ${balance.address}`, { error: error as Error });
      }
    }

    return transactions;
  }

  // ============================================
  // Wallet Assignments
  // ============================================

  /**
   * Record that a wallet is authorized on a contract
   */
  recordAuthorization(
    walletId: string,
    contractAddress: string,
    chain: ChainId,
    txHash: string
  ): void {
    const assignment: WalletAssignment = {
      walletId,
      contractAddress,
      chain,
      authorizedAt: Date.now(),
      txHash,
    };
    this.db.createAssignment(assignment);
  }

  /**
   * Get all assignments for a wallet
   */
  getWalletAssignments(walletId: string): WalletAssignment[] {
    return this.db.getAssignmentsForWallet(walletId);
  }

  // ============================================
  // Monitoring Service
  // ============================================

  /**
   * Start balance monitoring
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      this.logger.warn('Monitoring already running');
      return;
    }

    this.logger.info(`Starting balance monitoring (interval: ${this.config.checkIntervalMs}ms)`);

    this.monitoringInterval = setInterval(async () => {
      try {
        const lowBalance = await this.getLowBalanceWallets();
        if (lowBalance.length > 0) {
          this.logger.warn(`${lowBalance.length} wallets have low balance`);
          for (const b of lowBalance) {
            this.logger.warn(`  - ${b.address}: ${b.balanceFormatted} ${b.symbol}`);
          }
        }
      } catch (error) {
        this.logger.error('Balance check failed', { error: error as Error });
      }
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop balance monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.logger.info('Balance monitoring stopped');
    }
  }

  // ============================================
  // Query Methods
  // ============================================

  getAllWallets(): ManagedWallet[] {
    return this.db.getAllWallets();
  }

  getWallet(id: string): ManagedWallet | null {
    return this.db.getWallet(id);
  }

  getWalletsByChain(chain: ChainId): ManagedWallet[] {
    return this.db.getWalletsByChain(chain);
  }

  getWalletsByRole(role: WalletRole): ManagedWallet[] {
    return this.db.getWalletsByRole(role);
  }

  getFundingHistory(walletId: string): FundingTransaction[] {
    return this.db.getFundingHistory(walletId);
  }

  /**
   * Get wallet summary statistics
   */
  async getSummary(): Promise<WalletSummary> {
    const counts = this.db.getWalletCounts();
    const lowBalanceWallets = await this.getLowBalanceWallets();

    return {
      totalWallets: counts.total,
      byChain: counts.byChain as Record<ChainId, number>,
      byRole: counts.byRole as Record<WalletRole, number>,
      lowBalanceCount: lowBalanceWallets.length,
      totalValueUsd: 0, // TODO: Implement USD value calculation
    };
  }

  /**
   * Get private key for a wallet (from vault)
   */
  async getWalletPrivateKey(walletId: string): Promise<string> {
    const credentials = await this.vault.getWalletCredentials(walletId);
    return credentials.privateKey;
  }

  // ============================================
  // Cleanup
  // ============================================

  close(): void {
    this.stopMonitoring();
    this.db.close();
    this.logger.info('WalletManager closed');
  }
}
