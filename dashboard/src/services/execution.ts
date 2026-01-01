/**
 * Blockchain Execution Service
 * Handles real flash loan arbitrage execution on-chain
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  encodeFunctionData,
  type Address,
  type Hash,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, bsc, mainnet } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Contract ABIs (minimal for execution)
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
  {
    name: 'owner',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'authorizedExecutors',
    type: 'function',
    inputs: [{ name: 'executor', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'minProfitBps',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// Chain configurations
interface ChainConfig {
  chain: Chain;
  rpcUrl: string;
  contracts: {
    flashLoanReceiver: Address;
    multiDexRouter: Address;
  };
  tokens: Record<string, Address>;
}

// Load environment variables
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const envPath = path.resolve(__dirname, '../../../../.env');

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

// Load deployment configuration
function loadDeployment(chainId: string): {
  flashLoanReceiver: Address;
  multiDexRouter: Address;
} | null {
  const deployPath = path.resolve(__dirname, `../../../../deployments/${chainId}.json`);

  if (fs.existsSync(deployPath)) {
    const data = JSON.parse(fs.readFileSync(deployPath, 'utf-8'));
    return {
      flashLoanReceiver: data.contracts.FlashLoanReceiver as Address,
      multiDexRouter: data.contracts.MultiDexRouter as Address,
    };
  }

  return null;
}

// Execution result
export interface ExecutionResult {
  success: boolean;
  txHash?: Hash;
  blockNumber?: bigint;
  gasUsed?: bigint;
  profit?: bigint;
  error?: string;
}

// Execution parameters
export interface ExecutionParams {
  chain: string;
  asset: Address;
  amount: bigint;
  swaps: Array<{
    dex: Address;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    minAmountOut: bigint;
    data: `0x${string}`;
  }>;
  expectedProfit: bigint;
  opportunityId: `0x${string}`;
}

/**
 * Execute a flash loan arbitrage on-chain
 */
export async function executeFlashLoan(params: ExecutionParams): Promise<ExecutionResult> {
  const env = loadEnv();
  const privateKey = env.PRIVATE_KEY;

  if (!privateKey || privateKey.length < 64) {
    return { success: false, error: 'Private key not configured' };
  }

  // Get chain configuration
  let chain: Chain;
  let rpcUrl: string;

  switch (params.chain) {
    case 'sepolia':
      chain = sepolia;
      rpcUrl = env.SEPOLIA_RPC_URL;
      break;
    case 'bsc':
      chain = bsc;
      rpcUrl = env.BSC_RPC_URL;
      break;
    case 'ethereum':
      chain = mainnet;
      rpcUrl = env.ETH_RPC_URL;
      break;
    default:
      return { success: false, error: `Unsupported chain: ${params.chain}` };
  }

  if (!rpcUrl) {
    return { success: false, error: `RPC URL not configured for ${params.chain}` };
  }

  // Load deployment
  const deployment = loadDeployment(params.chain);
  if (!deployment) {
    return { success: false, error: `No deployment found for ${params.chain}` };
  }

  try {
    // Create clients
    const pk = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(pk);

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    // Encode arbitrage parameters
    const arbParams = {
      opportunityId: params.opportunityId,
      swaps: params.swaps.map((s) => ({
        dex: s.dex,
        tokenIn: s.tokenIn,
        tokenOut: s.tokenOut,
        amountIn: s.amountIn,
        minAmountOut: s.minAmountOut,
        data: s.data,
      })),
      expectedProfit: params.expectedProfit,
    };

    // Encode the params as bytes
    // Note: This is a simplified encoding - real implementation would use proper ABI encoding
    const encodedParams = encodeFunctionData({
      abi: [
        {
          name: 'encode',
          type: 'function',
          inputs: [
            {
              name: 'params',
              type: 'tuple',
              components: [
                { name: 'opportunityId', type: 'bytes32' },
                {
                  name: 'swaps',
                  type: 'tuple[]',
                  components: [
                    { name: 'dex', type: 'address' },
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'minAmountOut', type: 'uint256' },
                    { name: 'data', type: 'bytes' },
                  ],
                },
                { name: 'expectedProfit', type: 'uint256' },
              ],
            },
          ],
          outputs: [],
        },
      ],
      functionName: 'encode',
      args: [arbParams],
    }).slice(10) as `0x${string}`; // Remove function selector

    // Simulate first
    console.log('[Execution] Simulating transaction...');

    try {
      await publicClient.simulateContract({
        address: deployment.flashLoanReceiver,
        abi: FLASH_LOAN_RECEIVER_ABI,
        functionName: 'executeArbitrage',
        args: [params.asset, params.amount, encodedParams],
        account,
      });
    } catch (simError) {
      console.error('[Execution] Simulation failed:', simError);
      return {
        success: false,
        error: `Simulation failed: ${simError instanceof Error ? simError.message : 'Unknown error'}`,
      };
    }

    // Execute
    console.log('[Execution] Submitting transaction...');

    const txHash = await walletClient.writeContract({
      address: deployment.flashLoanReceiver,
      abi: FLASH_LOAN_RECEIVER_ABI,
      functionName: 'executeArbitrage',
      args: [params.asset, params.amount, encodedParams],
    });

    console.log('[Execution] Transaction submitted:', txHash);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    console.log('[Execution] Transaction confirmed:', receipt.status);

    if (receipt.status === 'success') {
      return {
        success: true,
        txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      };
    } else {
      return {
        success: false,
        txHash,
        error: 'Transaction reverted',
      };
    }
  } catch (error) {
    console.error('[Execution] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if the executor is authorized
 */
export async function checkExecutorStatus(
  chain: string
): Promise<{ authorized: boolean; owner: Address | null; error?: string }> {
  const env = loadEnv();
  const privateKey = env.PRIVATE_KEY;

  if (!privateKey || privateKey.length < 64) {
    return { authorized: false, owner: null, error: 'Private key not configured' };
  }

  let chainObj: Chain;
  let rpcUrl: string;

  switch (chain) {
    case 'sepolia':
      chainObj = sepolia;
      rpcUrl = env.SEPOLIA_RPC_URL;
      break;
    case 'bsc':
      chainObj = bsc;
      rpcUrl = env.BSC_RPC_URL;
      break;
    default:
      return { authorized: false, owner: null, error: `Unsupported chain: ${chain}` };
  }

  const deployment = loadDeployment(chain);
  if (!deployment) {
    return { authorized: false, owner: null, error: `No deployment for ${chain}` };
  }

  try {
    const pk = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(pk);

    const publicClient = createPublicClient({
      chain: chainObj,
      transport: http(rpcUrl),
    });

    const [owner, authorized] = await Promise.all([
      publicClient.readContract({
        address: deployment.flashLoanReceiver,
        abi: FLASH_LOAN_RECEIVER_ABI,
        functionName: 'owner',
      }),
      publicClient.readContract({
        address: deployment.flashLoanReceiver,
        abi: FLASH_LOAN_RECEIVER_ABI,
        functionName: 'authorizedExecutors',
        args: [account.address],
      }),
    ]);

    return {
      authorized,
      owner: owner as Address,
    };
  } catch (error) {
    return {
      authorized: false,
      owner: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Simple test transaction - just sends a small amount to verify wallet works
 */
export async function testWalletTransaction(chain: string): Promise<ExecutionResult> {
  const env = loadEnv();
  const privateKey = env.PRIVATE_KEY;

  if (!privateKey || privateKey.length < 64) {
    return { success: false, error: 'Private key not configured' };
  }

  let chainObj: Chain;
  let rpcUrl: string;

  switch (chain) {
    case 'sepolia':
      chainObj = sepolia;
      rpcUrl = env.SEPOLIA_RPC_URL;
      break;
    case 'bsc':
      chainObj = bsc;
      rpcUrl = env.BSC_RPC_URL;
      break;
    default:
      return { success: false, error: `Unsupported chain: ${chain}` };
  }

  if (!rpcUrl) {
    return { success: false, error: `RPC URL not configured for ${chain}` };
  }

  try {
    const pk = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(pk);

    const publicClient = createPublicClient({
      chain: chainObj,
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain: chainObj,
      transport: http(rpcUrl),
    });

    // Send 0 ETH to self (just to test transaction signing/submission)
    console.log('[Test] Sending test transaction...');

    const txHash = await walletClient.sendTransaction({
      to: account.address,
      value: 0n,
    });

    console.log('[Test] Transaction submitted:', txHash);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    return {
      success: receipt.status === 'success',
      txHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
