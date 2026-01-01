/**
 * Execute Real Flash Loan Arbitrage on BSC
 *
 * This script executes a real arbitrage trade using Aave V3 flash loans
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const envPath = path.resolve(__dirname, '../../.env');

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
  }

  return env;
}

// Contract addresses
const FLASH_LOAN_RECEIVER = '0xD94aeF4a31315398b8603041a60a607Dea0f598D' as Address;

// Token addresses on BSC
const TOKENS = {
  USDT: '0x55d398326f99059fF775485246999027B3197955' as Address,
  CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82' as Address,
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as Address,
};

// DEX router addresses
const DEX_ROUTERS = {
  MDEX: '0x7DAe51BD3E3376B8c7c4900E9107f12Be3AF1bA8' as Address,
  PancakeSwap: '0x10ED43C718714eb63d5aA57B78B54704E256024E' as Address,
};

// ABIs
const FLASH_LOAN_RECEIVER_ABI = [
  {
    name: 'executeArbitrage',
    type: 'function',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'params', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const ROUTER_ABI = [
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'getAmountsOut',
    type: 'function',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
  },
] as const;

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  MATRIX FLASH LOAN ARBITRAGE EXECUTION');
  console.log('  Chain: BSC Mainnet');
  console.log('='.repeat(60) + '\n');

  const env = loadEnv();
  const privateKey = env.PRIVATE_KEY;
  const rpcUrl = env.BSC_RPC_URL || 'https://bsc-mainnet.core.chainstack.com/acba35ed74b7bbddda5fdbc98656b7e3';

  if (!privateKey) {
    console.error('ERROR: PRIVATE_KEY not configured');
    process.exit(1);
  }

  const pk = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);

  const publicClient = createPublicClient({
    chain: bsc,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: bsc,
    transport: http(rpcUrl),
  });

  console.log('Wallet:', account.address);

  // Check wallet balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log('Balance:', formatUnits(balance, 18), 'BNB');

  if (balance < parseUnits('0.01', 18)) {
    console.error('ERROR: Insufficient BNB for gas');
    process.exit(1);
  }

  // Trade parameters - Start small for safety
  const BORROW_AMOUNT = parseUnits('100', 18); // Borrow 100 USDT
  const SLIPPAGE_BPS = 100; // 1% slippage tolerance

  console.log('\n--- Trade Setup ---');
  console.log('Borrow:', formatUnits(BORROW_AMOUNT, 18), 'USDT');
  console.log('Strategy: USDT -> CAKE (MDEX) -> USDT (PancakeSwap)');

  // Step 1: Get expected amounts from both DEXes
  console.log('\n--- Getting Quotes ---');

  // Quote 1: USDT -> CAKE on MDEX
  let cakeAmountExpected: bigint;
  try {
    const mdexQuote = await publicClient.readContract({
      address: DEX_ROUTERS.MDEX,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [BORROW_AMOUNT, [TOKENS.USDT, TOKENS.CAKE]],
    });
    cakeAmountExpected = mdexQuote[1];
    console.log('MDEX Quote: ', formatUnits(BORROW_AMOUNT, 18), 'USDT ->', formatUnits(cakeAmountExpected, 18), 'CAKE');
  } catch (error) {
    console.error('Failed to get MDEX quote:', error);
    process.exit(1);
  }

  // Quote 2: CAKE -> USDT on PancakeSwap
  let usdtAmountExpected: bigint;
  try {
    const pancakeQuote = await publicClient.readContract({
      address: DEX_ROUTERS.PancakeSwap,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [cakeAmountExpected, [TOKENS.CAKE, TOKENS.USDT]],
    });
    usdtAmountExpected = pancakeQuote[1];
    console.log('PancakeSwap Quote:', formatUnits(cakeAmountExpected, 18), 'CAKE ->', formatUnits(usdtAmountExpected, 18), 'USDT');
  } catch (error) {
    console.error('Failed to get PancakeSwap quote:', error);
    process.exit(1);
  }

  // Calculate expected profit
  const flashLoanFee = (BORROW_AMOUNT * 9n) / 10000n; // 0.09% Aave fee
  const totalOwed = BORROW_AMOUNT + flashLoanFee;
  const expectedProfit = usdtAmountExpected - totalOwed;
  const profitBps = Number((expectedProfit * 10000n) / BORROW_AMOUNT);

  console.log('\n--- Profit Analysis ---');
  console.log('Flash Loan Fee:', formatUnits(flashLoanFee, 18), 'USDT');
  console.log('Total to Repay:', formatUnits(totalOwed, 18), 'USDT');
  console.log('Expected Return:', formatUnits(usdtAmountExpected, 18), 'USDT');
  console.log('Expected Profit:', formatUnits(expectedProfit, 18), 'USDT');
  console.log('Profit BPS:', profitBps);

  if (expectedProfit <= 0n) {
    console.error('\nERROR: Trade is not profitable!');
    console.log('The spread has closed or fees exceed profit.');
    process.exit(1);
  }

  if (profitBps < 10) {
    console.error('\nERROR: Profit below minimum threshold (0.1%)');
    process.exit(1);
  }

  console.log('\n✓ Trade is PROFITABLE!');

  // Step 2: Build swap calldata
  console.log('\n--- Building Transaction ---');

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 minutes
  const minCakeAmount = (cakeAmountExpected * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;
  const minUsdtAmount = (usdtAmountExpected * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;

  // Swap 1: USDT -> CAKE on MDEX
  const swap1Data = encodeFunctionData({
    abi: ROUTER_ABI,
    functionName: 'swapExactTokensForTokens',
    args: [BORROW_AMOUNT, minCakeAmount, [TOKENS.USDT, TOKENS.CAKE], FLASH_LOAN_RECEIVER, deadline],
  });

  // Swap 2: CAKE -> USDT on PancakeSwap
  const swap2Data = encodeFunctionData({
    abi: ROUTER_ABI,
    functionName: 'swapExactTokensForTokens',
    args: [cakeAmountExpected, minUsdtAmount, [TOKENS.CAKE, TOKENS.USDT], FLASH_LOAN_RECEIVER, deadline],
  });

  // Build ArbitrageParams struct
  const opportunityId = ('0x' + Date.now().toString(16).padStart(64, '0')) as `0x${string}`;

  // Encode the ArbitrageParams
  const arbitrageParams = encodeAbiParameters(
    parseAbiParameters('(bytes32 opportunityId, (address dex, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes data)[] swaps, uint256 expectedProfit)'),
    [{
      opportunityId,
      swaps: [
        {
          dex: DEX_ROUTERS.MDEX,
          tokenIn: TOKENS.USDT,
          tokenOut: TOKENS.CAKE,
          amountIn: BORROW_AMOUNT,
          minAmountOut: minCakeAmount,
          data: swap1Data,
        },
        {
          dex: DEX_ROUTERS.PancakeSwap,
          tokenIn: TOKENS.CAKE,
          tokenOut: TOKENS.USDT,
          amountIn: cakeAmountExpected,
          minAmountOut: minUsdtAmount,
          data: swap2Data,
        },
      ],
      expectedProfit,
    }]
  );

  console.log('Opportunity ID:', opportunityId);
  console.log('Params encoded successfully');

  // Step 3: Simulate the transaction
  console.log('\n--- Simulating Transaction ---');

  try {
    await publicClient.simulateContract({
      address: FLASH_LOAN_RECEIVER,
      abi: FLASH_LOAN_RECEIVER_ABI,
      functionName: 'executeArbitrage',
      args: [TOKENS.USDT, BORROW_AMOUNT, arbitrageParams],
      account,
    });
    console.log('✓ Simulation PASSED');
  } catch (error: any) {
    console.error('✗ Simulation FAILED:', error.message || error);
    console.log('\nThis could mean:');
    console.log('- Aave V3 on BSC may not support USDT flash loans');
    console.log('- Insufficient liquidity');
    console.log('- Price has moved');
    process.exit(1);
  }

  // Step 4: Execute the transaction
  console.log('\n--- Executing Transaction ---');
  console.log('Submitting to BSC mainnet...');

  try {
    const txHash = await walletClient.writeContract({
      address: FLASH_LOAN_RECEIVER,
      abi: FLASH_LOAN_RECEIVER_ABI,
      functionName: 'executeArbitrage',
      args: [TOKENS.USDT, BORROW_AMOUNT, arbitrageParams],
    });

    console.log('TX Hash:', txHash);
    console.log('Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    console.log('\n' + '='.repeat(60));
    if (receipt.status === 'success') {
      console.log('  ✓ ARBITRAGE SUCCESSFUL!');
      console.log('='.repeat(60));
      console.log('TX Hash:', txHash);
      console.log('Block:', receipt.blockNumber.toString());
      console.log('Gas Used:', receipt.gasUsed.toString());
      console.log('Explorer: https://bscscan.com/tx/' + txHash);
    } else {
      console.log('  ✗ TRANSACTION REVERTED');
      console.log('='.repeat(60));
      console.log('TX Hash:', txHash);
      console.log('The trade may have become unprofitable or failed due to slippage.');
    }
  } catch (error: any) {
    console.error('\n✗ Execution FAILED:', error.message || error);
    process.exit(1);
  }
}

main().catch(console.error);
