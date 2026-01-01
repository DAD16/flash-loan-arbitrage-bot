/**
 * Execution Routes - Real blockchain execution
 */

import { Router, Request, Response } from 'express';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, bsc } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// Load environment
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

// Load deployment
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

// FlashLoanReceiver ABI
const FLASH_LOAN_RECEIVER_ABI = [
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

// GET /api/execute/status - Check execution capability
router.get('/status', async (req: Request, res: Response) => {
  const { chain = 'sepolia' } = req.query;
  const env = loadEnv();
  const privateKey = env.PRIVATE_KEY;

  if (!privateKey || privateKey.length < 64) {
    return res.json({
      ready: false,
      error: 'Private key not configured',
    });
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
      return res.json({
        ready: false,
        error: `Unsupported chain: ${chain}`,
      });
  }

  if (!rpcUrl) {
    return res.json({
      ready: false,
      error: `RPC URL not configured for ${chain}`,
    });
  }

  const deployment = loadDeployment(chain as string);
  if (!deployment) {
    return res.json({
      ready: false,
      error: `No deployment found for ${chain}`,
    });
  }

  try {
    const pk = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(pk);

    const publicClient = createPublicClient({
      chain: chainObj,
      transport: http(rpcUrl),
    });

    const [owner, authorized, minProfitBps, balance] = await Promise.all([
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
      publicClient.readContract({
        address: deployment.flashLoanReceiver,
        abi: FLASH_LOAN_RECEIVER_ABI,
        functionName: 'minProfitBps',
      }),
      publicClient.getBalance({ address: account.address }),
    ]);

    res.json({
      ready: authorized,
      chain,
      wallet: account.address,
      contracts: deployment,
      owner,
      authorized,
      minProfitBps: Number(minProfitBps),
      balance: balance.toString(),
      balanceFormatted: (Number(balance) / 1e18).toFixed(4),
    });
  } catch (error) {
    res.json({
      ready: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/execute/test - Send a test transaction (0 ETH to self)
router.post('/test', async (req: Request, res: Response) => {
  const { chain = 'sepolia' } = req.body;
  const env = loadEnv();
  const privateKey = env.PRIVATE_KEY;

  if (!privateKey || privateKey.length < 64) {
    return res.status(400).json({ error: 'Private key not configured' });
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
      return res.status(400).json({ error: `Unsupported chain: ${chain}` });
  }

  if (!rpcUrl) {
    return res.status(400).json({ error: `RPC URL not configured for ${chain}` });
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

    console.log(`[Execute] Sending test transaction on ${chain}...`);

    // Send 0 ETH to self
    const txHash = await walletClient.sendTransaction({
      to: account.address,
      value: 0n,
    });

    console.log(`[Execute] Transaction submitted: ${txHash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    console.log(`[Execute] Transaction confirmed: ${receipt.status}`);

    res.json({
      success: receipt.status === 'success',
      txHash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      chain,
      explorer: chain === 'sepolia'
        ? `https://sepolia.etherscan.io/tx/${txHash}`
        : `https://bscscan.com/tx/${txHash}`,
    });
  } catch (error) {
    console.error('[Execute] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
