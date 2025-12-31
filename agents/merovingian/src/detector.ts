/**
 * MEROVINGIAN - MEV Opportunity Detector
 */

import {
  AgentLogger,
  type PendingTransaction,
  type MevOpportunity,
  type MevType,
} from '@matrix/shared';
import type { DetectorConfig } from './types.js';

type OpportunityHandler = (opportunity: MevOpportunity) => void;

export class MempoolDetector {
  private logger: AgentLogger;
  private config: DetectorConfig;
  private handlers: OpportunityHandler[];
  private knownRoutersSet: Set<string>;
  private knownPoolsSet: Set<string>;

  constructor(config: DetectorConfig) {
    this.logger = new AgentLogger('MEROVINGIAN-DETECTOR');
    this.config = config;
    this.handlers = [];
    this.knownRoutersSet = new Set(config.knownRouters.map((r) => r.toLowerCase()));
    this.knownPoolsSet = new Set(config.knownDexPools.map((p) => p.toLowerCase()));
  }

  /**
   * Register a handler for detected opportunities
   */
  onOpportunity(handler: OpportunityHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Analyze a pending transaction for MEV opportunities
   */
  analyze(tx: PendingTransaction): MevOpportunity | null {
    // Skip transactions with no data (simple transfers)
    if (!tx.data || tx.data === '0x') {
      return null;
    }

    // Check if this is a DEX swap
    const isSwap = this.isSwapTransaction(tx);
    if (!isSwap) {
      return null;
    }

    // Determine opportunity type
    const opportunityType = this.classifyOpportunity(tx);
    if (!opportunityType) {
      return null;
    }

    // Calculate estimated profit and confidence
    const { profit, confidence } = this.estimateProfit(tx, opportunityType);

    // Skip low-confidence or unprofitable opportunities
    if (confidence < 0.5 || profit <= 0n) {
      return null;
    }

    const opportunity: MevOpportunity = {
      type: opportunityType,
      targetTx: tx,
      estimatedProfit: profit,
      gasRequired: this.estimateGasRequired(opportunityType),
      deadline: tx.timestampMs + 12000, // ~1 block
      confidence,
    };

    // Notify handlers
    this.notifyHandlers(opportunity);

    return opportunity;
  }

  /**
   * Check if transaction is a swap
   */
  private isSwapTransaction(tx: PendingTransaction): boolean {
    // Check if to address is a known router
    if (this.knownRoutersSet.has(tx.to.toLowerCase())) {
      return true;
    }

    // Check function signature (first 4 bytes of data)
    const selector = tx.data.slice(0, 10).toLowerCase();

    // Common swap function selectors
    const swapSelectors = [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x4a25d94a', // swapTokensForExactETH
      '0x18cbafe5', // swapExactTokensForETH
      '0xfb3bdb41', // swapETHForExactTokens
      '0x5c11d795', // swapExactTokensForTokensSupportingFeeOnTransferTokens
      '0xb6f9de95', // swapExactETHForTokensSupportingFeeOnTransferTokens
      '0x791ac947', // swapExactTokensForETHSupportingFeeOnTransferTokens
      '0xc04b8d59', // exactInput (Uniswap V3)
      '0xdb3e2198', // exactInputSingle (Uniswap V3)
      '0xf28c0498', // exactOutput (Uniswap V3)
      '0x414bf389', // exactOutputSingle (Uniswap V3)
    ];

    return swapSelectors.includes(selector);
  }

  /**
   * Classify the type of MEV opportunity
   */
  private classifyOpportunity(tx: PendingTransaction): MevType | null {
    const valueEth = Number(tx.value) / 1e18;

    // Large swap = potential backrun opportunity
    if (valueEth >= this.config.whaleThresholdEth) {
      return 'backrun';
    }

    // Medium swap = potential arbitrage
    if (valueEth >= this.config.minSwapValueEth) {
      return 'arbitrage';
    }

    return null;
  }

  /**
   * Estimate potential profit from opportunity
   */
  private estimateProfit(
    tx: PendingTransaction,
    type: MevType
  ): { profit: bigint; confidence: number } {
    // Simplified profit estimation
    // In production, this would involve:
    // 1. Decoding swap parameters
    // 2. Simulating the swap
    // 3. Checking for price impact
    // 4. Calculating arbitrage profit

    const valueEth = Number(tx.value) / 1e18;
    let profitBps: number;
    let confidence: number;

    switch (type) {
      case 'backrun':
        // Backruns typically capture 0.1-0.5% of swap value
        profitBps = 10 + Math.random() * 40;
        confidence = 0.6;
        break;
      case 'arbitrage':
        // Arbitrage profits vary more widely
        profitBps = 5 + Math.random() * 25;
        confidence = 0.7;
        break;
      default:
        profitBps = 0;
        confidence = 0;
    }

    const profitEth = (valueEth * profitBps) / 10000;
    const profitWei = BigInt(Math.floor(profitEth * 1e18));

    return { profit: profitWei, confidence };
  }

  /**
   * Estimate gas required for opportunity
   */
  private estimateGasRequired(type: MevType): bigint {
    const gasEstimates: Record<MevType, bigint> = {
      arbitrage: 300000n,
      backrun: 250000n,
      sandwich: 500000n,
      liquidation: 400000n,
    };

    return gasEstimates[type] || 300000n;
  }

  /**
   * Notify all registered handlers
   */
  private notifyHandlers(opportunity: MevOpportunity): void {
    this.logger.info('MEV opportunity detected', {
      chain: opportunity.targetTx.chainId.toString(),
      txHash: opportunity.targetTx.hash,
      profitWei: opportunity.estimatedProfit.toString(),
    });

    for (const handler of this.handlers) {
      try {
        handler(opportunity);
      } catch (error) {
        this.logger.error('Handler error', { error: error as Error });
      }
    }
  }
}
