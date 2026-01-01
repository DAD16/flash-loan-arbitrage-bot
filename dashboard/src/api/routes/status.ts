/**
 * Status Routes - RPC and Wallet Connection Verification
 *
 * GET /api/status - Full system status with RPC and wallet checks
 */

import { Router, Request, Response } from 'express';
import { createPublicClient, http, formatEther, type Chain } from 'viem';
import { mainnet, arbitrum, optimism, base, bsc, sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// Load environment variables
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const envPath = path.resolve(__dirname, '../../../../.env');

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
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

// Chain configurations
interface ChainConfig {
  id: string;
  name: string;
  chain: Chain;
  rpcEnvVar: string;
  symbol: string;
  explorer: string;
}

const chains: ChainConfig[] = [
  {
    id: 'sepolia',
    name: 'Sepolia Testnet',
    chain: sepolia,
    rpcEnvVar: 'SEPOLIA_RPC_URL',
    symbol: 'ETH',
    explorer: 'https://sepolia.etherscan.io'
  },
  {
    id: 'bsc',
    name: 'BNB Smart Chain',
    chain: bsc,
    rpcEnvVar: 'BSC_RPC_URL',
    symbol: 'BNB',
    explorer: 'https://bscscan.com'
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    chain: mainnet,
    rpcEnvVar: 'ETH_RPC_URL',
    symbol: 'ETH',
    explorer: 'https://etherscan.io'
  },
  {
    id: 'arbitrum',
    name: 'Arbitrum',
    chain: arbitrum,
    rpcEnvVar: 'ARB_RPC_URL',
    symbol: 'ETH',
    explorer: 'https://arbiscan.io'
  },
  {
    id: 'optimism',
    name: 'Optimism',
    chain: optimism,
    rpcEnvVar: 'OP_RPC_URL',
    symbol: 'ETH',
    explorer: 'https://optimistic.etherscan.io'
  },
  {
    id: 'base',
    name: 'Base',
    chain: base,
    rpcEnvVar: 'BASE_RPC_URL',
    symbol: 'ETH',
    explorer: 'https://basescan.org'
  },
];

// Test RPC connection
async function testRpcConnection(config: ChainConfig, rpcUrl: string): Promise<{
  connected: boolean;
  blockNumber?: string;
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();

  try {
    const client = createPublicClient({
      chain: config.chain,
      transport: http(rpcUrl, { timeout: 10000 }),
    });

    const blockNumber = await client.getBlockNumber();
    const latencyMs = Date.now() - start;

    return {
      connected: true,
      blockNumber: blockNumber.toString(),
      latencyMs
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Connection failed'
    };
  }
}

// Get wallet balance
async function getWalletBalance(
  rpcUrl: string,
  chain: Chain,
  address: string
): Promise<{ balance: string; balanceFormatted: string } | null> {
  try {
    const client = createPublicClient({
      chain,
      transport: http(rpcUrl, { timeout: 10000 }),
    });

    const balance = await client.getBalance({ address: address as `0x${string}` });
    return {
      balance: balance.toString(),
      balanceFormatted: formatEther(balance)
    };
  } catch {
    return null;
  }
}

// GET /api/status - Full system status
router.get('/', async (req: Request, res: Response) => {
  const env = loadEnv();
  const startTime = Date.now();

  // Check wallet configuration
  let wallet: {
    configured: boolean;
    address?: string;
    balances?: Record<string, { balance: string; balanceFormatted: string; symbol: string }>;
  } = { configured: false };

  const privateKey = env.PRIVATE_KEY;
  if (privateKey && privateKey.length >= 64) {
    try {
      const pk = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
      const account = privateKeyToAccount(pk as `0x${string}`);
      wallet = {
        configured: true,
        address: account.address,
        balances: {}
      };
    } catch {
      wallet = { configured: false };
    }
  }

  // Check RPC connections
  const rpcStatus: Record<string, {
    configured: boolean;
    connected: boolean;
    blockNumber?: string;
    latencyMs?: number;
    error?: string;
  }> = {};

  for (const chainConfig of chains) {
    const rpcUrl = env[chainConfig.rpcEnvVar];

    if (!rpcUrl || rpcUrl.includes('YOUR_KEY')) {
      rpcStatus[chainConfig.id] = {
        configured: false,
        connected: false,
        error: `${chainConfig.rpcEnvVar} not configured`
      };
      continue;
    }

    const result = await testRpcConnection(chainConfig, rpcUrl);
    rpcStatus[chainConfig.id] = {
      configured: true,
      ...result
    };

    // Get wallet balance if wallet is configured and chain is connected
    if (wallet.configured && wallet.address && result.connected && wallet.balances) {
      const balanceResult = await getWalletBalance(rpcUrl, chainConfig.chain, wallet.address);
      if (balanceResult) {
        wallet.balances[chainConfig.id] = {
          ...balanceResult,
          symbol: chainConfig.symbol
        };
      }
    }
  }

  // Check contracts deployment status
  const contracts: Record<string, {
    flashLoanReceiver?: string;
    multiDexRouter?: string;
    deployed: boolean;
  }> = {};

  // Check for deployment files
  const deploymentsPath = path.resolve(__dirname, '../../../../deployments');
  for (const chainConfig of chains) {
    const chainDeployPath = path.join(deploymentsPath, chainConfig.id);
    const flashLoanPath = path.join(chainDeployPath, 'FlashLoanReceiver.json');
    const routerPath = path.join(chainDeployPath, 'MultiDexRouter.json');

    let flashLoanReceiver: string | undefined;
    let multiDexRouter: string | undefined;

    try {
      if (fs.existsSync(flashLoanPath)) {
        const data = JSON.parse(fs.readFileSync(flashLoanPath, 'utf-8'));
        flashLoanReceiver = data.address;
      }
    } catch {}

    try {
      if (fs.existsSync(routerPath)) {
        const data = JSON.parse(fs.readFileSync(routerPath, 'utf-8'));
        multiDexRouter = data.address;
      }
    } catch {}

    contracts[chainConfig.id] = {
      flashLoanReceiver,
      multiDexRouter,
      deployed: !!(flashLoanReceiver && multiDexRouter)
    };
  }

  // Database status
  let database: { exists: boolean; sizeKb?: number } = { exists: false };
  const dbPath = path.resolve(__dirname, '../../../db/matrix.db');
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    database = {
      exists: true,
      sizeKb: Math.round(stats.size / 1024)
    };
  }

  // Calculate overall health
  const connectedChains = Object.values(rpcStatus).filter(r => r.connected).length;
  const configuredChains = Object.values(rpcStatus).filter(r => r.configured).length;
  const totalLatency = Date.now() - startTime;

  const health = {
    status: connectedChains > 0 ? 'healthy' : 'degraded',
    chainsConnected: connectedChains,
    chainsConfigured: configuredChains,
    walletConfigured: wallet.configured,
    databaseReady: database.exists,
    checkDurationMs: totalLatency
  };

  res.json({
    health,
    chains: Object.entries(rpcStatus).map(([id, status]) => ({
      id,
      name: chains.find(c => c.id === id)?.name,
      ...status
    })),
    wallet: {
      configured: wallet.configured,
      address: wallet.address,
      balances: wallet.balances
    },
    contracts,
    database,
    environment: env.MATRIX_ENVIRONMENT || 'development',
    timestamp: new Date().toISOString()
  });
});

// GET /api/status/chains - Quick RPC status check
router.get('/chains', async (req: Request, res: Response) => {
  const env = loadEnv();
  const results: Record<string, boolean> = {};

  for (const chainConfig of chains) {
    const rpcUrl = env[chainConfig.rpcEnvVar];

    if (!rpcUrl || rpcUrl.includes('YOUR_KEY')) {
      results[chainConfig.id] = false;
      continue;
    }

    try {
      const client = createPublicClient({
        chain: chainConfig.chain,
        transport: http(rpcUrl, { timeout: 5000 }),
      });
      await client.getBlockNumber();
      results[chainConfig.id] = true;
    } catch {
      results[chainConfig.id] = false;
    }
  }

  res.json({ chains: results });
});

// GET /api/status/wallet - Wallet status
router.get('/wallet', async (req: Request, res: Response) => {
  const env = loadEnv();
  const privateKey = env.PRIVATE_KEY;

  if (!privateKey || privateKey.length < 64) {
    return res.json({
      configured: false,
      message: 'PRIVATE_KEY not configured in .env'
    });
  }

  try {
    const pk = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const account = privateKeyToAccount(pk as `0x${string}`);

    res.json({
      configured: true,
      address: account.address
    });
  } catch (error) {
    res.json({
      configured: false,
      error: 'Invalid private key format'
    });
  }
});

export default router;
