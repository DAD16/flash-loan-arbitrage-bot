/**
 * Seed Sample Arbitrage Data
 * Populates the dashboard database with realistic test data
 */

import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../db/matrix.db');

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// Helper functions
const randomBetween = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randomFloat = (min: number, max: number) =>
  Math.random() * (max - min) + min;

const randomChoice = <T>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

const weiFromEth = (eth: number): string =>
  BigInt(Math.floor(eth * 1e18)).toString();

const randomAddress = (): string =>
  '0x' + [...Array(40)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

const randomTxHash = (): string =>
  '0x' + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

const hoursAgo = (hours: number): string =>
  new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

// Sample data
const COMPETITOR_LABELS = [
  'FlashBot Alpha', 'MEV Master', 'ArbitrageKing', 'DeFi Sniper',
  'Sandwich Lord', 'LiquidityHunter', 'GasGuzzler', 'TokenWhale',
  'ChainHopper', 'SwapNinja', null, null, null // Some without labels
];

const TOKENS = {
  WBNB: { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB' },
  USDT: { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT' },
  BUSD: { address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', symbol: 'BUSD' },
  USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC' },
  ETH: { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', symbol: 'ETH' },
  BTCB: { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', symbol: 'BTCB' },
  CAKE: { address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', symbol: 'CAKE' },
  XRP: { address: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', symbol: 'XRP' },
};

const DEXES = ['PancakeSwap', 'Biswap', 'BakerySwap', 'ApeSwap', 'MDEX'];

const ROUTES = [
  { tokens: ['WBNB', 'USDT', 'BUSD', 'WBNB'], dexes: ['PancakeSwap', 'Biswap', 'PancakeSwap'] },
  { tokens: ['WBNB', 'CAKE', 'USDT', 'WBNB'], dexes: ['PancakeSwap', 'PancakeSwap', 'Biswap'] },
  { tokens: ['WBNB', 'ETH', 'USDC', 'WBNB'], dexes: ['Biswap', 'PancakeSwap', 'ApeSwap'] },
  { tokens: ['USDT', 'BUSD', 'USDC', 'USDT'], dexes: ['PancakeSwap', 'Biswap', 'MDEX'] },
  { tokens: ['WBNB', 'BTCB', 'ETH', 'WBNB'], dexes: ['PancakeSwap', 'Biswap', 'PancakeSwap'] },
  { tokens: ['WBNB', 'XRP', 'USDT', 'WBNB'], dexes: ['ApeSwap', 'PancakeSwap', 'Biswap'] },
  { tokens: ['CAKE', 'WBNB', 'USDT', 'CAKE'], dexes: ['PancakeSwap', 'Biswap', 'PancakeSwap'] },
  { tokens: ['WBNB', 'USDC', 'BUSD', 'WBNB'], dexes: ['Biswap', 'MDEX', 'PancakeSwap'] },
];

const CONFIDENCES = ['low', 'medium', 'high', 'very_high'];
const OPPORTUNITY_STATUSES = ['detected', 'evaluating', 'executing', 'completed', 'skipped', 'failed'];
const TX_STATUSES = ['pending', 'success', 'failed', 'reverted'];

console.log('🔮 MATRIX COMMAND CENTER - Data Seeder');
console.log('═'.repeat(50));

// Clear existing data
console.log('\n🧹 Clearing existing data...');
db.exec(`
  DELETE FROM competitor_transactions;
  DELETE FROM competitors;
  DELETE FROM executions;
  DELETE FROM opportunities;
  DELETE FROM ai_recommendations;
  DELETE FROM patterns;
  DELETE FROM daily_performance;
  DELETE FROM hourly_metrics;
`);

// ============================================================================
// SEED COMPETITORS
// ============================================================================
console.log('\n👥 Seeding competitors...');

const competitors: Array<{ id: string; address: string }> = [];

const insertCompetitor = db.prepare(`
  INSERT INTO competitors (
    id, address, chain, label, is_watched, first_seen_at, last_active_at,
    total_profit_wei, total_transactions, success_rate, avg_profit_per_tx_wei, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (let i = 0; i < 15; i++) {
  const id = randomUUID();
  const address = randomAddress();
  const label = COMPETITOR_LABELS[i % COMPETITOR_LABELS.length];
  const isWatched = i < 5 ? 1 : 0; // Watch top 5
  const firstSeenAt = daysAgo(randomBetween(30, 180));
  const lastActiveAt = hoursAgo(randomBetween(0, 48));
  const totalTxs = randomBetween(50, 500);
  const successRate = randomFloat(0.15, 0.45);
  const avgProfit = randomFloat(0.001, 0.05);
  const totalProfit = avgProfit * totalTxs * successRate;

  insertCompetitor.run(
    id, address, 'bsc', label, isWatched, firstSeenAt, lastActiveAt,
    weiFromEth(totalProfit), totalTxs, successRate * 100,
    weiFromEth(avgProfit), i < 3 ? 'Known whale, high success rate' : null
  );

  competitors.push({ id, address });
}

console.log(`   ✓ Created ${competitors.length} competitors`);

// ============================================================================
// SEED COMPETITOR TRANSACTIONS
// ============================================================================
console.log('\n📜 Seeding competitor transactions...');

const insertCompTx = db.prepare(`
  INSERT INTO competitor_transactions (
    id, competitor_id, chain, tx_hash, block_number, block_timestamp,
    route_tokens, route_dexes, profit_wei, profit_usd, gas_used,
    gas_price_wei, gas_cost_wei, net_profit_wei, status, revert_reason,
    opportunity_type, is_flashloan
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let compTxCount = 0;
for (const comp of competitors.slice(0, 10)) {
  const txCount = randomBetween(20, 80);

  for (let i = 0; i < txCount; i++) {
    const route = randomChoice(ROUTES);
    const status = Math.random() > 0.3 ? 'success' : randomChoice(['failed', 'reverted']);
    const grossProfit = status === 'success' ? randomFloat(0.002, 0.08) : 0;
    const gasUsed = randomBetween(150000, 450000);
    const gasPrice = randomFloat(3, 8) * 1e9; // 3-8 gwei
    const gasCost = gasUsed * gasPrice / 1e18;
    const netProfit = Math.max(0, grossProfit - gasCost);
    const blockNumber = 35000000 + randomBetween(0, 500000);

    insertCompTx.run(
      randomUUID(),
      comp.id,
      'bsc',
      randomTxHash(),
      blockNumber,
      hoursAgo(randomBetween(1, 168)), // Last week
      JSON.stringify(route.tokens.map(t => TOKENS[t as keyof typeof TOKENS].address)),
      JSON.stringify(route.dexes),
      weiFromEth(grossProfit),
      grossProfit * 600, // ~$600/BNB
      gasUsed,
      BigInt(Math.floor(gasPrice)).toString(),
      weiFromEth(gasCost),
      weiFromEth(netProfit),
      status,
      status === 'reverted' ? 'INSUFFICIENT_OUTPUT_AMOUNT' : null,
      randomChoice(['triangular', 'cross-dex', 'flashloan']),
      Math.random() > 0.6 ? 1 : 0
    );
    compTxCount++;
  }
}

console.log(`   ✓ Created ${compTxCount} competitor transactions`);

// ============================================================================
// SEED OUR OPPORTUNITIES
// ============================================================================
console.log('\n⚡ Seeding opportunities...');

const insertOpportunity = db.prepare(`
  INSERT INTO opportunities (
    id, chain, route_tokens, route_token_symbols, route_dexes,
    expected_profit_wei, expected_profit_usd, expected_gas_wei,
    expected_net_profit_wei, confidence, confidence_score,
    detected_at, valid_until, status, skip_reason
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const opportunities: Array<{ id: string; route: typeof ROUTES[0] }> = [];

// Create mix of statuses
const statusDistribution = [
  ...Array(8).fill('detected'),      // 8 pending
  ...Array(5).fill('evaluating'),    // 5 evaluating
  ...Array(3).fill('executing'),     // 3 executing
  ...Array(40).fill('completed'),    // 40 completed
  ...Array(15).fill('skipped'),      // 15 skipped
  ...Array(10).fill('failed'),       // 10 failed
];

for (let i = 0; i < statusDistribution.length; i++) {
  const id = randomUUID();
  const route = randomChoice(ROUTES);
  const status = statusDistribution[i];
  const confidence = randomChoice(CONFIDENCES);
  const confidenceScore = {
    low: randomFloat(0.2, 0.4),
    medium: randomFloat(0.4, 0.6),
    high: randomFloat(0.6, 0.8),
    very_high: randomFloat(0.8, 0.95),
  }[confidence];

  const expectedProfit = randomFloat(0.003, 0.1);
  const expectedGas = randomFloat(0.0005, 0.002);
  const expectedNet = expectedProfit - expectedGas;

  const detectedAt = status === 'detected' || status === 'evaluating' || status === 'executing'
    ? hoursAgo(randomFloat(0, 0.5)) // Recent for pending
    : hoursAgo(randomBetween(1, 72)); // Older for completed

  const validUntil = status === 'detected' || status === 'evaluating'
    ? new Date(Date.now() + randomBetween(10, 60) * 1000).toISOString() // Valid for 10-60 more seconds
    : null;

  const skipReason = status === 'skipped'
    ? randomChoice(['profit_too_low', 'gas_too_high', 'liquidity_insufficient', 'confidence_low'])
    : null;

  insertOpportunity.run(
    id, 'bsc',
    JSON.stringify(route.tokens.map(t => TOKENS[t as keyof typeof TOKENS].address)),
    JSON.stringify(route.tokens),
    JSON.stringify(route.dexes),
    weiFromEth(expectedProfit),
    expectedProfit * 600,
    weiFromEth(expectedGas),
    weiFromEth(expectedNet),
    confidence,
    confidenceScore,
    detectedAt,
    validUntil,
    status,
    skipReason
  );

  opportunities.push({ id, route });
}

console.log(`   ✓ Created ${opportunities.length} opportunities`);

// ============================================================================
// SEED OUR EXECUTIONS
// ============================================================================
console.log('\n🚀 Seeding executions...');

const insertExecution = db.prepare(`
  INSERT INTO executions (
    id, opportunity_id, chain, tx_hash, block_number, block_timestamp,
    route_tokens, route_token_symbols, route_dexes,
    expected_profit_wei, actual_profit_wei, gas_used, gas_price_wei,
    gas_cost_wei, net_profit_wei, net_profit_usd,
    expected_slippage_bps, actual_slippage_bps, status,
    revert_reason, error_message, submitted_at, confirmed_at,
    execution_time_ms, was_frontrun, frontrunner_address
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Execute completed and failed opportunities
const completedOpps = opportunities.filter((_, i) =>
  ['completed', 'failed', 'executing'].includes(statusDistribution[i])
);

let execCount = 0;
for (let i = 0; i < completedOpps.length; i++) {
  const opp = completedOpps[i];
  const isSuccess = Math.random() > 0.25;
  const status = isSuccess ? 'success' : randomChoice(['failed', 'reverted']);

  const expectedProfit = randomFloat(0.005, 0.08);
  const slippage = randomFloat(-0.02, 0.03); // -2% to +3%
  const actualProfit = isSuccess ? expectedProfit * (1 + slippage) : 0;
  const gasUsed = randomBetween(180000, 400000);
  const gasPrice = randomFloat(3, 7) * 1e9;
  const gasCost = gasUsed * gasPrice / 1e18;
  const netProfit = Math.max(0, actualProfit - gasCost);
  const blockNumber = 35000000 + randomBetween(0, 500000);
  const wasFrontrun = !isSuccess && Math.random() > 0.7;

  const submittedAt = hoursAgo(randomBetween(1, 72));
  const execTimeMs = randomBetween(800, 3500);

  insertExecution.run(
    randomUUID(),
    opp.id,
    'bsc',
    randomTxHash(),
    blockNumber,
    submittedAt,
    JSON.stringify(opp.route.tokens.map(t => TOKENS[t as keyof typeof TOKENS].address)),
    JSON.stringify(opp.route.tokens),
    JSON.stringify(opp.route.dexes),
    weiFromEth(expectedProfit),
    weiFromEth(actualProfit),
    gasUsed,
    BigInt(Math.floor(gasPrice)).toString(),
    weiFromEth(gasCost),
    weiFromEth(netProfit),
    netProfit * 600,
    randomBetween(10, 50),
    isSuccess ? randomBetween(5, 80) : null,
    status,
    status === 'reverted' ? randomChoice(['INSUFFICIENT_OUTPUT_AMOUNT', 'EXPIRED', 'K']) : null,
    status === 'failed' ? 'Transaction simulation failed' : null,
    submittedAt,
    isSuccess ? new Date(new Date(submittedAt).getTime() + execTimeMs).toISOString() : null,
    execTimeMs,
    wasFrontrun ? 1 : 0,
    wasFrontrun ? randomAddress() : null
  );
  execCount++;
}

console.log(`   ✓ Created ${execCount} executions`);

// ============================================================================
// SEED AI RECOMMENDATIONS
// ============================================================================
console.log('\n🧠 Seeding AI recommendations...');

const insertRecommendation = db.prepare(`
  INSERT INTO ai_recommendations (
    id, chain, category, priority, title, description,
    evidence, suggested_action, expected_impact, expected_profit_increase_pct,
    status, created_at, expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const recommendations = [
  {
    category: 'gas_optimization',
    priority: 'warning',
    title: 'Optimize gas bidding for PancakeSwap routes',
    description: 'Analysis shows 23% of failed transactions had insufficient gas priority. Consider increasing base gas by 15% for high-confidence opportunities on PancakeSwap.',
    expectedImpact: 'Reduce failed transactions by ~20%',
    expectedProfitIncrease: 18,
  },
  {
    category: 'route_discovery',
    priority: 'info',
    title: 'New profitable route detected: WBNB→DOGE→USDT→WBNB',
    description: 'Competitor "FlashBot Alpha" has been profiting from DOGE triangular arbitrage. Average profit: 0.015 BNB per trade. Low competition detected.',
    expectedImpact: 'Additional 0.3 BNB daily profit potential',
    expectedProfitIncrease: 12,
  },
  {
    category: 'timing',
    priority: 'critical',
    title: 'Peak profitability window: 14:00-16:00 UTC',
    description: 'Historical analysis shows 40% higher success rate during Asian market overlap. Consider concentrating execution during this window.',
    expectedImpact: 'Improve success rate from 28% to 39%',
    expectedProfitIncrease: 35,
  },
  {
    category: 'risk',
    priority: 'warning',
    title: 'Increase slippage tolerance for CAKE pairs',
    description: 'CAKE liquidity has decreased 15% this week. Current slippage settings causing 12% opportunity skip rate. Recommend increasing from 30bps to 50bps.',
    expectedImpact: 'Capture 8 additional opportunities per day',
    expectedProfitIncrease: 8,
  },
  {
    category: 'competitor',
    priority: 'info',
    title: 'New whale competitor detected',
    description: 'Address 0x7a3...f9c2 has executed 47 profitable trades in 24h with 52% success rate. Monitoring recommended - may affect our routes.',
    expectedImpact: 'Competitive awareness',
    expectedProfitIncrease: null,
  },
  {
    category: 'gas_optimization',
    priority: 'info',
    title: 'Consider Flashbots for MEV protection',
    description: '18% of our failed transactions show signs of frontrunning. Flashbots integration could protect high-value opportunities.',
    expectedImpact: 'Reduce frontrun losses by ~$150/day',
    expectedProfitIncrease: 15,
  },
];

for (const rec of recommendations) {
  insertRecommendation.run(
    randomUUID(),
    'bsc',
    rec.category,
    rec.priority,
    rec.title,
    rec.description,
    JSON.stringify({ analyzed_txs: randomBetween(100, 500), confidence: randomFloat(0.7, 0.95) }),
    JSON.stringify({ type: 'config_change', param: rec.category }),
    rec.expectedImpact,
    rec.expectedProfitIncrease,
    'pending',
    hoursAgo(randomBetween(1, 48)),
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Expires in 7 days
  );
}

console.log(`   ✓ Created ${recommendations.length} AI recommendations`);

// ============================================================================
// SEED AI PATTERNS
// ============================================================================
console.log('\n🔍 Seeding AI patterns...');

const insertPattern = db.prepare(`
  INSERT INTO patterns (
    id, chain, pattern_type, name, description, pattern_data,
    confidence_score, analysis_start, analysis_end, is_active
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const patterns = [
  {
    type: 'competitor_behavior',
    name: 'FlashBot Alpha timing pattern',
    description: 'Executes primarily during low-gas periods (02:00-06:00 UTC)',
    data: { peak_hours: [2, 3, 4, 5], avg_gas_gwei: 3.2 },
    confidence: 0.87,
  },
  {
    type: 'market_condition',
    name: 'High volatility arbitrage window',
    description: 'Arbitrage opportunities increase 3x during BTC price swings >2%',
    data: { btc_volatility_threshold: 0.02, opportunity_multiplier: 3.1 },
    confidence: 0.92,
  },
  {
    type: 'route_efficiency',
    name: 'PancakeSwap→Biswap optimal path',
    description: 'Cross-DEX routes between PancakeSwap and Biswap show highest profit margins',
    data: { avg_profit_bps: 45, success_rate: 0.34 },
    confidence: 0.78,
  },
  {
    type: 'gas_pattern',
    name: 'Weekend gas optimization',
    description: 'Gas prices 25% lower on weekends, ideal for lower-margin trades',
    data: { weekday_avg_gwei: 5.2, weekend_avg_gwei: 3.9 },
    confidence: 0.95,
  },
];

for (const pattern of patterns) {
  insertPattern.run(
    randomUUID(),
    'bsc',
    pattern.type,
    pattern.name,
    pattern.description,
    JSON.stringify(pattern.data),
    pattern.confidence,
    daysAgo(7),
    hoursAgo(1),
    1
  );
}

console.log(`   ✓ Created ${patterns.length} AI patterns`);

// ============================================================================
// SEED DAILY PERFORMANCE
// ============================================================================
console.log('\n📊 Seeding daily performance...');

const insertDailyPerf = db.prepare(`
  INSERT INTO daily_performance (
    id, date, chain, total_opportunities, total_executions,
    successful_executions, failed_executions, skipped_opportunities,
    gross_profit_wei, gas_spent_wei, net_profit_wei, net_profit_usd,
    success_rate, avg_profit_per_tx_wei, our_rank, top_competitor_profit_wei,
    profit_by_pair, profit_by_dex
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Last 30 days of performance
for (let d = 29; d >= 0; d--) {
  const date = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
  const dateStr = date.toISOString().split('T')[0];

  const totalOpps = randomBetween(80, 200);
  const skipped = Math.floor(totalOpps * randomFloat(0.15, 0.30));
  const totalExecs = totalOpps - skipped;
  const successRate = randomFloat(0.22, 0.38);
  const successful = Math.floor(totalExecs * successRate);
  const failed = totalExecs - successful;

  const avgProfit = randomFloat(0.008, 0.025);
  const grossProfit = avgProfit * successful;
  const gasSpent = randomFloat(0.002, 0.008) * totalExecs;
  const netProfit = grossProfit - gasSpent;

  const ourRank = randomBetween(3, 12);
  const topCompProfit = netProfit * randomFloat(1.5, 3.0);

  insertDailyPerf.run(
    randomUUID(),
    dateStr,
    'bsc',
    totalOpps,
    totalExecs,
    successful,
    failed,
    skipped,
    weiFromEth(grossProfit),
    weiFromEth(gasSpent),
    weiFromEth(netProfit),
    netProfit * 600,
    successRate * 100,
    weiFromEth(avgProfit),
    ourRank,
    weiFromEth(topCompProfit),
    JSON.stringify({ 'WBNB/USDT': 0.35, 'WBNB/CAKE': 0.25, 'USDT/BUSD': 0.20, 'Other': 0.20 }),
    JSON.stringify({ PancakeSwap: 0.55, Biswap: 0.25, ApeSwap: 0.12, MDEX: 0.08 })
  );
}

console.log(`   ✓ Created 30 days of performance data`);

// ============================================================================
// SEED HOURLY METRICS
// ============================================================================
console.log('\n⏱️  Seeding hourly metrics...');

const insertHourlyMetrics = db.prepare(`
  INSERT INTO hourly_metrics (
    id, hour_start, chain, opportunities_detected, executions_attempted,
    executions_successful, gross_profit_wei, net_profit_wei,
    avg_gas_price_gwei, avg_execution_time_ms, competitor_activity_count
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Last 48 hours
for (let h = 47; h >= 0; h--) {
  const hourStart = new Date(Date.now() - h * 60 * 60 * 1000);
  hourStart.setMinutes(0, 0, 0);

  const oppsDetected = randomBetween(3, 12);
  const execsAttempted = randomBetween(2, oppsDetected);
  const execsSuccessful = Math.floor(execsAttempted * randomFloat(0.2, 0.4));

  const grossProfit = randomFloat(0.002, 0.015) * execsSuccessful;
  const netProfit = grossProfit * randomFloat(0.6, 0.85);

  insertHourlyMetrics.run(
    randomUUID(),
    hourStart.toISOString(),
    'bsc',
    oppsDetected,
    execsAttempted,
    execsSuccessful,
    weiFromEth(grossProfit),
    weiFromEth(netProfit),
    randomFloat(3.5, 6.5),
    randomBetween(1200, 2800),
    randomBetween(5, 25)
  );
}

console.log(`   ✓ Created 48 hours of metrics`);

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '═'.repeat(50));
console.log('✅ SEEDING COMPLETE!');
console.log('═'.repeat(50));

// Get counts
const counts = {
  competitors: db.prepare('SELECT COUNT(*) as c FROM competitors').get() as { c: number },
  compTxs: db.prepare('SELECT COUNT(*) as c FROM competitor_transactions').get() as { c: number },
  opportunities: db.prepare('SELECT COUNT(*) as c FROM opportunities').get() as { c: number },
  executions: db.prepare('SELECT COUNT(*) as c FROM executions').get() as { c: number },
  recommendations: db.prepare('SELECT COUNT(*) as c FROM ai_recommendations').get() as { c: number },
  patterns: db.prepare('SELECT COUNT(*) as c FROM patterns').get() as { c: number },
  dailyPerf: db.prepare('SELECT COUNT(*) as c FROM daily_performance').get() as { c: number },
  hourlyMetrics: db.prepare('SELECT COUNT(*) as c FROM hourly_metrics').get() as { c: number },
};

console.log(`
   Competitors:           ${counts.competitors.c}
   Competitor Txs:        ${counts.compTxs.c}
   Opportunities:         ${counts.opportunities.c}
   Executions:            ${counts.executions.c}
   AI Recommendations:    ${counts.recommendations.c}
   AI Patterns:           ${counts.patterns.c}
   Daily Performance:     ${counts.dailyPerf.c} days
   Hourly Metrics:        ${counts.hourlyMetrics.c} hours
`);

// Show some stats
const pendingOpps = db.prepare(`SELECT COUNT(*) as c FROM opportunities WHERE status IN ('detected', 'evaluating')`).get() as { c: number };
const successRate = db.prepare(`SELECT AVG(success_rate) as avg FROM daily_performance`).get() as { avg: number };
const totalProfit = db.prepare(`SELECT SUM(CAST(net_profit_wei AS REAL)) / 1e18 as total FROM executions WHERE status = 'success'`).get() as { total: number };

console.log(`
   📈 Key Metrics:
   ─────────────────────────
   Pending Opportunities:  ${pendingOpps.c}
   Avg Success Rate:       ${successRate.avg?.toFixed(1)}%
   Total Net Profit:       ${totalProfit.total?.toFixed(4)} BNB
`);

console.log('🎯 Dashboard ready for testing at http://localhost:9080');

db.close();
