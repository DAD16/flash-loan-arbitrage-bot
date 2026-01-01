/**
 * Competitor Data Ingestion Service
 * Monitors blockchain for competitor arbitrage transactions
 *
 * Agent: MEROVINGIAN (Mempool Monitor)
 */

import { createPublicClient, http, parseAbiItem, decodeEventLog, formatEther, type Log } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../db/matrix.db');

// Known DEX router addresses on BSC
const KNOWN_ROUTERS: Record<string, string> = {
  '0x10ED43C718714eb63d5aA57B78B54704E256024E': 'PancakeSwap V2',
  '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4': 'PancakeSwap V3',
  '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8': 'BiSwap',
  '0xd4ae6eCA985340Dd434D38F470aCCce4DC78D109': 'Thena',
  '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7': 'ApeSwap',
  '0x7DAe51BD3E3376B8c7c4900E9107f12Be3AF1bA8': 'MDEX',
};

// Known flash loan provider addresses
const FLASH_LOAN_PROVIDERS: string[] = [
  '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9', // Aave V2 LendingPool
  '0x794a61358D6845594F94dc1DB02A252b5b4814aD', // Aave V3 Pool
];

// Transfer event signature
const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

interface IngestionConfig {
  chain: 'bsc' | 'bscTestnet';
  rpcUrl: string;
  pollIntervalMs: number;
  batchSize: number;
  minProfitWei: bigint;
}

interface CompetitorTx {
  txHash: string;
  blockNumber: number;
  blockTimestamp: string;
  fromAddress: string;
  toAddress: string;
  routeTokens: string[];
  routeDexes: string[];
  profitWei: string;
  profitUsd: number | null;
  gasUsed: number;
  gasPriceWei: string;
  gasCostWei: string;
  netProfitWei: string;
  status: 'success' | 'failed' | 'reverted';
  isFlashloan: boolean;
  opportunityType: string;
}

export class CompetitorIngestionService {
  private client: ReturnType<typeof createPublicClient>;
  private db: Database.Database;
  private config: IngestionConfig;
  private isRunning: boolean = false;
  private lastProcessedBlock: number = 0;
  private knownCompetitors: Set<string> = new Set();

  constructor(config: Partial<IngestionConfig> = {}) {
    this.config = {
      chain: config.chain || 'bsc',
      rpcUrl: config.rpcUrl || 'https://bsc-dataseed1.binance.org/',
      pollIntervalMs: config.pollIntervalMs || 3000, // BSC has 3s blocks
      batchSize: config.batchSize || 10,
      minProfitWei: config.minProfitWei || BigInt('100000000000000000'), // 0.1 BNB
    };

    // Create viem client
    const chain = this.config.chain === 'bsc' ? bsc : bscTestnet;
    this.client = createPublicClient({
      chain,
      transport: http(this.config.rpcUrl),
    });

    // Connect to database
    this.db = new Database(DB_PATH);
    this.db.pragma('foreign_keys = ON');

    // Load known competitors
    this.loadKnownCompetitors();
  }

  private loadKnownCompetitors(): void {
    const competitors = this.db.prepare(
      'SELECT address FROM competitors WHERE chain = ?'
    ).all(this.config.chain) as { address: string }[];

    this.knownCompetitors = new Set(competitors.map(c => c.address.toLowerCase()));
    console.log(`Loaded ${this.knownCompetitors.size} known competitors`);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Ingestion service already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting competitor ingestion for ${this.config.chain}...`);

    // Get current block
    const currentBlock = await this.client.getBlockNumber();
    this.lastProcessedBlock = Number(currentBlock) - 1;
    console.log(`Starting from block ${this.lastProcessedBlock}`);

    // Start polling loop
    this.pollLoop();
  }

  stop(): void {
    this.isRunning = false;
    console.log('Stopping competitor ingestion...');
  }

  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const currentBlock = await this.client.getBlockNumber();
        const toBlock = Number(currentBlock);

        if (toBlock > this.lastProcessedBlock) {
          const fromBlock = this.lastProcessedBlock + 1;
          const endBlock = Math.min(fromBlock + this.config.batchSize - 1, toBlock);

          console.log(`Processing blocks ${fromBlock} to ${endBlock}...`);
          await this.processBlocks(fromBlock, endBlock);

          this.lastProcessedBlock = endBlock;
        }

        // Wait before next poll
        await this.sleep(this.config.pollIntervalMs);
      } catch (error) {
        console.error('Error in poll loop:', error);
        await this.sleep(5000); // Wait longer on error
      }
    }
  }

  private async processBlocks(fromBlock: number, toBlock: number): Promise<void> {
    // Get all transactions in block range
    for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
      try {
        const block = await this.client.getBlock({
          blockNumber: BigInt(blockNum),
          includeTransactions: true,
        });

        if (!block.transactions || block.transactions.length === 0) continue;

        for (const tx of block.transactions) {
          if (typeof tx === 'string') continue; // Skip if only hash

          // Check if this is a potential arbitrage transaction
          if (await this.isPotentialArbitrage(tx)) {
            await this.analyzeTx(tx, block.timestamp);
          }
        }
      } catch (error) {
        console.error(`Error processing block ${blockNum}:`, error);
      }
    }
  }

  private async isPotentialArbitrage(tx: any): Promise<boolean> {
    // Quick heuristics to filter potential arbitrage transactions:
    // 1. High gas usage (> 200k typically indicates complex swaps)
    // 2. Interacts with multiple DEX routers
    // 3. From address is a known competitor
    // 4. Contract with complex internal transactions

    if (!tx.to) return false; // Contract creation

    const toAddressLower = tx.to.toLowerCase();
    const fromAddressLower = tx.from.toLowerCase();

    // Known competitor
    if (this.knownCompetitors.has(fromAddressLower)) {
      return true;
    }

    // Interacts with known DEX router
    if (KNOWN_ROUTERS[tx.to]) {
      return true;
    }

    // High value transactions to contracts
    if (tx.value && BigInt(tx.value) > BigInt('1000000000000000000')) { // > 1 BNB
      return true;
    }

    return false;
  }

  private async analyzeTx(tx: any, blockTimestamp: bigint): Promise<void> {
    try {
      // Get transaction receipt for gas info and logs
      const receipt = await this.client.getTransactionReceipt({
        hash: tx.hash,
      });

      if (!receipt) return;

      // Parse Transfer events to understand token flow
      const transfers = this.parseTransferEvents(receipt.logs);

      if (transfers.length < 2) return; // Not enough transfers for arbitrage

      // Detect arbitrage pattern (same token in first and last transfer to same address)
      const arbPattern = this.detectArbitragePattern(transfers, tx.from);

      if (!arbPattern) return;

      // Calculate profit
      const profitWei = arbPattern.profitWei;
      if (profitWei < this.config.minProfitWei) return;

      // Build competitor transaction record
      const competitorTx: CompetitorTx = {
        txHash: tx.hash,
        blockNumber: Number(tx.blockNumber),
        blockTimestamp: new Date(Number(blockTimestamp) * 1000).toISOString(),
        fromAddress: tx.from,
        toAddress: tx.to || '',
        routeTokens: arbPattern.tokens,
        routeDexes: this.extractDexes(receipt.logs),
        profitWei: profitWei.toString(),
        profitUsd: null, // TODO: Calculate USD value
        gasUsed: Number(receipt.gasUsed),
        gasPriceWei: tx.gasPrice?.toString() || '0',
        gasCostWei: (BigInt(receipt.gasUsed) * BigInt(tx.gasPrice || 0)).toString(),
        netProfitWei: (profitWei - BigInt(receipt.gasUsed) * BigInt(tx.gasPrice || 0)).toString(),
        status: receipt.status === 'success' ? 'success' : 'reverted',
        isFlashloan: this.detectFlashloan(receipt.logs),
        opportunityType: arbPattern.type,
      };

      // Save to database
      await this.saveCompetitorTransaction(competitorTx);

      console.log(`Found ${arbPattern.type} arbitrage: ${tx.hash} - Profit: ${formatEther(profitWei)} BNB`);
    } catch (error) {
      // Transaction analysis failed, skip
    }
  }

  private parseTransferEvents(logs: Log[]): Array<{
    token: string;
    from: string;
    to: string;
    value: bigint;
  }> {
    const transfers: Array<{
      token: string;
      from: string;
      to: string;
      value: bigint;
    }> = [];

    for (const log of logs) {
      try {
        // Check if this is a Transfer event (topic0 matches)
        if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
          const from = '0x' + log.topics[1]?.slice(26);
          const to = '0x' + log.topics[2]?.slice(26);
          const value = log.data ? BigInt(log.data) : BigInt(0);

          transfers.push({
            token: log.address,
            from: from.toLowerCase(),
            to: to.toLowerCase(),
            value,
          });
        }
      } catch {
        // Skip malformed logs
      }
    }

    return transfers;
  }

  private detectArbitragePattern(
    transfers: Array<{ token: string; from: string; to: string; value: bigint }>,
    executor: string
  ): { tokens: string[]; profitWei: bigint; type: string } | null {
    const executorLower = executor.toLowerCase();

    // Group transfers by token
    const tokenBalances: Map<string, { received: bigint; sent: bigint }> = new Map();

    for (const t of transfers) {
      if (!tokenBalances.has(t.token)) {
        tokenBalances.set(t.token, { received: BigInt(0), sent: BigInt(0) });
      }

      const balance = tokenBalances.get(t.token)!;
      if (t.to === executorLower) {
        balance.received += t.value;
      }
      if (t.from === executorLower) {
        balance.sent += t.value;
      }
    }

    // Find tokens with net positive balance (profit)
    let maxProfit = BigInt(0);
    let profitToken = '';

    for (const [token, balance] of tokenBalances.entries()) {
      const netProfit = balance.received - balance.sent;
      if (netProfit > maxProfit) {
        maxProfit = netProfit;
        profitToken = token;
      }
    }

    if (maxProfit <= BigInt(0)) return null;

    // Extract unique tokens in order
    const tokens = [...new Set(transfers.map(t => t.token))];

    // Determine arbitrage type
    let type = 'simple';
    if (tokens.length === 2) {
      type = 'two_token';
    } else if (tokens.length === 3) {
      type = 'triangular';
    } else if (tokens.length > 3) {
      type = 'multi_hop';
    }

    return {
      tokens,
      profitWei: maxProfit,
      type,
    };
  }

  private extractDexes(logs: Log[]): string[] {
    const dexes: string[] = [];

    for (const log of logs) {
      const routerName = KNOWN_ROUTERS[log.address];
      if (routerName && !dexes.includes(routerName)) {
        dexes.push(routerName);
      }
    }

    return dexes;
  }

  private detectFlashloan(logs: Log[]): boolean {
    // Look for flash loan event signatures
    for (const log of logs) {
      // Aave FlashLoan event
      if (log.topics[0] === '0x5b8cd3cb6d79cdf804f52c9c2eb8a0d762a27f8c81b74c6d7e8a8bf9f87b5e6a') {
        return true;
      }
      // PancakeSwap Flash swap
      if (log.topics[0] === '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822') {
        return true;
      }
    }

    return false;
  }

  private async saveCompetitorTransaction(tx: CompetitorTx): Promise<void> {
    // Check if competitor exists, create if not
    let competitorId = this.getOrCreateCompetitor(tx.fromAddress);

    // Insert transaction
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO competitor_transactions (
          competitor_id, chain, tx_hash, block_number, block_timestamp,
          route_tokens, route_dexes, profit_wei, profit_usd,
          gas_used, gas_price_wei, gas_cost_wei, net_profit_wei,
          status, opportunity_type, is_flashloan
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        competitorId,
        this.config.chain,
        tx.txHash,
        tx.blockNumber,
        tx.blockTimestamp,
        JSON.stringify(tx.routeTokens),
        JSON.stringify(tx.routeDexes),
        tx.profitWei,
        tx.profitUsd,
        tx.gasUsed,
        tx.gasPriceWei,
        tx.gasCostWei,
        tx.netProfitWei,
        tx.status,
        tx.opportunityType,
        tx.isFlashloan ? 1 : 0
      );

      // Update competitor stats
      this.updateCompetitorStats(competitorId, tx);
    } catch (error) {
      console.error('Error saving competitor transaction:', error);
    }
  }

  private getOrCreateCompetitor(address: string): string {
    const addressLower = address.toLowerCase();

    // Check if exists
    const existing = this.db.prepare(
      'SELECT id FROM competitors WHERE address = ? AND chain = ?'
    ).get(addressLower, this.config.chain) as { id: string } | undefined;

    if (existing) {
      return existing.id;
    }

    // Create new competitor
    this.db.prepare(`
      INSERT INTO competitors (address, chain, is_watched, first_seen_at)
      VALUES (?, ?, 0, datetime('now'))
    `).run(addressLower, this.config.chain);

    const newCompetitor = this.db.prepare(
      'SELECT id FROM competitors WHERE address = ? AND chain = ?'
    ).get(addressLower, this.config.chain) as { id: string };

    // Add to known set
    this.knownCompetitors.add(addressLower);

    return newCompetitor.id;
  }

  private updateCompetitorStats(competitorId: string, tx: CompetitorTx): void {
    // Update competitor aggregate stats
    this.db.prepare(`
      UPDATE competitors SET
        last_active_at = datetime('now'),
        total_transactions = total_transactions + 1,
        total_profit_wei = CAST(total_profit_wei AS INTEGER) + CAST(? AS INTEGER),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(tx.status === 'success' ? tx.netProfitWei : '0', competitorId);

    // Recalculate success rate
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful
      FROM competitor_transactions
      WHERE competitor_id = ?
    `).get(competitorId) as { total: number; successful: number };

    const successRate = stats.total > 0 ? (stats.successful / stats.total) * 100 : 0;

    this.db.prepare(`
      UPDATE competitors SET success_rate = ? WHERE id = ?
    `).run(successRate, competitorId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public method to add competitor to watch list
  addWatchedCompetitor(address: string, label?: string): string {
    const addressLower = address.toLowerCase();

    // Check if exists
    const existing = this.db.prepare(
      'SELECT id FROM competitors WHERE address = ? AND chain = ?'
    ).get(addressLower, this.config.chain) as { id: string } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE competitors SET is_watched = 1, label = COALESCE(?, label) WHERE id = ?
      `).run(label || null, existing.id);
      return existing.id;
    }

    // Create new watched competitor
    this.db.prepare(`
      INSERT INTO competitors (address, chain, label, is_watched, first_seen_at)
      VALUES (?, ?, ?, 1, datetime('now'))
    `).run(addressLower, this.config.chain, label || null);

    const newCompetitor = this.db.prepare(
      'SELECT id FROM competitors WHERE address = ? AND chain = ?'
    ).get(addressLower, this.config.chain) as { id: string };

    this.knownCompetitors.add(addressLower);

    return newCompetitor.id;
  }

  // Get ingestion stats
  getStats(): { lastBlock: number; knownCompetitors: number; isRunning: boolean } {
    return {
      lastBlock: this.lastProcessedBlock,
      knownCompetitors: this.knownCompetitors.size,
      isRunning: this.isRunning,
    };
  }
}

// CLI entry point
if (process.argv[1].includes('competitorIngestion')) {
  const service = new CompetitorIngestionService({
    chain: 'bsc',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org/',
  });

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    service.stop();
    process.exit(0);
  });

  service.start().catch(console.error);
}

export default CompetitorIngestionService;
