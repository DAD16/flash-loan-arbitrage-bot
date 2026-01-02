/**
 * Wallet Management API Routes
 *
 * Standalone wallet management endpoints for the dashboard.
 * Uses SQLite for persistence and ethers.js for HD wallet derivation.
 */

import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { ethers } from 'ethers';
import { randomUUID } from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Types
type ChainId = 1 | 56 | 137 | 42161 | 10 | 8453 | 11155111;
type WalletRole = 'master' | 'gas_reserve' | 'executor';

interface ManagedWallet {
  id: string;
  address: string;
  chain: ChainId;
  role: WalletRole;
  label: string;
  derivationPath: string;
  createdAt: number;
  lastFundedAt: number | null;
  isActive: boolean;
}

interface WalletBalance {
  walletId: string;
  address: string;
  chain: ChainId;
  balanceWei: string;
  balanceFormatted: string;
  symbol: string;
  updatedAt: number;
  isLow: boolean;
}

// Chain configurations
const CHAIN_CONFIG: Record<number, { name: string; symbol: string; rpcUrl: string }> = {
  1: { name: 'Ethereum', symbol: 'ETH', rpcUrl: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com' },
  56: { name: 'BSC', symbol: 'BNB', rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org' },
  137: { name: 'Polygon', symbol: 'MATIC', rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com' },
  42161: { name: 'Arbitrum', symbol: 'ETH', rpcUrl: process.env.ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc' },
  11155111: { name: 'Sepolia', symbol: 'ETH', rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org' },
};

const LOW_BALANCE_THRESHOLDS: Record<number, bigint> = {
  1: ethers.parseEther('0.05'),
  56: ethers.parseEther('0.1'),
  137: ethers.parseEther('5'),
  42161: ethers.parseEther('0.01'),
  11155111: ethers.parseEther('0.1'),
};

// Database setup
const dataDir = join(__dirname, '..', '..', '..', 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const db = new Database(join(dataDir, 'wallets.db'));
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    address TEXT NOT NULL UNIQUE,
    chain INTEGER NOT NULL,
    role TEXT NOT NULL,
    label TEXT NOT NULL,
    derivation_path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_funded_at INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS wallet_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_id TEXT NOT NULL,
    contract_address TEXT NOT NULL,
    chain INTEGER NOT NULL,
    authorized_at INTEGER NOT NULL,
    tx_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wallet_balances (
    wallet_id TEXT PRIMARY KEY,
    balance_wei TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS funding_transactions (
    id TEXT PRIMARY KEY,
    from_wallet_id TEXT NOT NULL,
    to_wallet_id TEXT NOT NULL,
    chain INTEGER NOT NULL,
    amount_wei TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    confirmed_at INTEGER
  );
`);

// Provider cache
const providers: Map<number, ethers.JsonRpcProvider> = new Map();
function getProvider(chain: number): ethers.JsonRpcProvider {
  if (!providers.has(chain)) {
    const config = CHAIN_CONFIG[chain];
    if (!config) throw new Error(`Unknown chain: ${chain}`);
    providers.set(chain, new ethers.JsonRpcProvider(config.rpcUrl));
  }
  return providers.get(chain)!;
}

// Wallet index for derivation
let walletIndex = 0;
const existingWallets = db.prepare('SELECT derivation_path FROM wallets').all() as { derivation_path: string }[];
if (existingWallets.length > 0) {
  const maxIndex = Math.max(
    ...existingWallets.map((w) => {
      const match = w.derivation_path.match(/\/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
  );
  walletIndex = maxIndex + 1;
}

// Monitoring state
let monitoringInterval: NodeJS.Timeout | null = null;

// Helper functions
function rowToWallet(row: any): ManagedWallet {
  return {
    id: row.id,
    address: row.address,
    chain: row.chain as ChainId,
    role: row.role as WalletRole,
    label: row.label,
    derivationPath: row.derivation_path,
    createdAt: row.created_at,
    lastFundedAt: row.last_funded_at,
    isActive: row.is_active === 1,
  };
}

async function getWalletBalance(wallet: ManagedWallet): Promise<WalletBalance> {
  const provider = getProvider(wallet.chain);
  const balanceWei = await provider.getBalance(wallet.address);
  const threshold = LOW_BALANCE_THRESHOLDS[wallet.chain] || BigInt(0);
  const config = CHAIN_CONFIG[wallet.chain];

  // Update cached balance
  const now = Date.now();
  db.prepare(`
    INSERT INTO wallet_balances (wallet_id, balance_wei, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(wallet_id) DO UPDATE SET balance_wei = ?, updated_at = ?
  `).run(wallet.id, balanceWei.toString(), now, balanceWei.toString(), now);

  return {
    walletId: wallet.id,
    address: wallet.address,
    chain: wallet.chain,
    balanceWei: balanceWei.toString(),
    balanceFormatted: ethers.formatEther(balanceWei),
    symbol: config?.symbol || 'ETH',
    updatedAt: now,
    isLow: balanceWei < threshold,
  };
}

const router = Router();

/**
 * GET /api/wallets/all
 * Get all wallet data in a single optimized call (wallets + balances + summary)
 */
router.get('/all', async (req: Request, res: Response) => {
  try {
    const wallets = db.prepare('SELECT * FROM wallets WHERE is_active = 1 ORDER BY created_at DESC').all().map(rowToWallet);
    const now = Date.now();
    const maxAge = 30000;

    // Try cached balances first
    const balances: WalletBalance[] = [];
    const staleWallets: ManagedWallet[] = [];

    for (const wallet of wallets) {
      const cached = db.prepare(
        'SELECT balance_wei, updated_at FROM wallet_balances WHERE wallet_id = ?'
      ).get(wallet.id) as { balance_wei: string; updated_at: number } | undefined;

      if (cached && (now - cached.updated_at) < maxAge) {
        const config = CHAIN_CONFIG[wallet.chain];
        const threshold = LOW_BALANCE_THRESHOLDS[wallet.chain] || BigInt(0);
        balances.push({
          walletId: wallet.id,
          address: wallet.address,
          chain: wallet.chain,
          balanceWei: cached.balance_wei,
          balanceFormatted: ethers.formatEther(BigInt(cached.balance_wei)),
          symbol: config?.symbol || 'ETH',
          updatedAt: cached.updated_at,
          isLow: BigInt(cached.balance_wei) < threshold,
        });
      } else {
        staleWallets.push(wallet);
      }
    }

    // Fetch stale balances in parallel (background, don't wait)
    if (staleWallets.length > 0) {
      Promise.allSettled(staleWallets.map((w) => getWalletBalance(w).catch(() => null)));
    }

    // Calculate summary from cached data
    const chainCounts = db.prepare(
      'SELECT chain, COUNT(*) as count FROM wallets WHERE is_active = 1 GROUP BY chain'
    ).all() as { chain: number; count: number }[];

    const roleCounts = db.prepare(
      'SELECT role, COUNT(*) as count FROM wallets WHERE is_active = 1 GROUP BY role'
    ).all() as { role: string; count: number }[];

    const byChain: Record<number, number> = {};
    chainCounts.forEach((c) => { byChain[c.chain] = c.count; });

    const byRole: Record<string, number> = {};
    roleCounts.forEach((r) => { byRole[r.role] = r.count; });

    const lowBalanceCount = balances.filter((b) => b.isLow).length;

    res.json({
      success: true,
      data: {
        wallets,
        balances,
        summary: {
          totalWallets: wallets.length,
          byChain,
          byRole,
          lowBalanceCount,
          totalValueUsd: 0,
        },
      },
      staleCount: staleWallets.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/wallets
 * List all managed wallets
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const chain = req.query.chain ? parseInt(req.query.chain as string, 10) : undefined;
    const role = req.query.role as string | undefined;

    let query = 'SELECT * FROM wallets WHERE is_active = 1';
    const params: any[] = [];

    if (chain) {
      query += ' AND chain = ?';
      params.push(chain);
    }
    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    query += ' ORDER BY created_at DESC';

    const rows = db.prepare(query).all(...params);
    const wallets = rows.map(rowToWallet);

    res.json({
      success: true,
      data: wallets,
      count: wallets.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/wallets/summary
 * Get wallet summary statistics
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const chainCounts = db.prepare(
      'SELECT chain, COUNT(*) as count FROM wallets WHERE is_active = 1 GROUP BY chain'
    ).all() as { chain: number; count: number }[];

    const roleCounts = db.prepare(
      'SELECT role, COUNT(*) as count FROM wallets WHERE is_active = 1 GROUP BY role'
    ).all() as { role: string; count: number }[];

    const totalCount = db.prepare(
      'SELECT COUNT(*) as count FROM wallets WHERE is_active = 1'
    ).get() as { count: number };

    // Get low balance count from cached balances
    const wallets = db.prepare('SELECT * FROM wallets WHERE is_active = 1').all().map(rowToWallet);
    let lowBalanceCount = 0;

    for (const wallet of wallets) {
      const cached = db.prepare('SELECT balance_wei FROM wallet_balances WHERE wallet_id = ?').get(wallet.id) as { balance_wei: string } | undefined;
      if (cached) {
        const threshold = LOW_BALANCE_THRESHOLDS[wallet.chain] || BigInt(0);
        if (BigInt(cached.balance_wei) < threshold) {
          lowBalanceCount++;
        }
      }
    }

    const byChain: Record<number, number> = {};
    chainCounts.forEach((c) => { byChain[c.chain] = c.count; });

    const byRole: Record<string, number> = {};
    roleCounts.forEach((r) => { byRole[r.role] = r.count; });

    res.json({
      success: true,
      data: {
        totalWallets: totalCount.count,
        byChain,
        byRole,
        lowBalanceCount,
        totalValueUsd: 0, // TODO: Implement USD value
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/wallets/balances
 * Get all wallet balances - optimized with parallel fetching and caching
 */
router.get('/balances', async (req: Request, res: Response) => {
  try {
    const wallets = db.prepare('SELECT * FROM wallets WHERE is_active = 1').all().map(rowToWallet);
    const useCached = req.query.cached !== 'false';
    const maxAge = 30000; // 30 second cache
    const now = Date.now();

    // Check for fresh cached balances first
    if (useCached) {
      const cachedBalances: WalletBalance[] = [];
      let allCached = true;

      for (const wallet of wallets) {
        const cached = db.prepare(
          'SELECT balance_wei, updated_at FROM wallet_balances WHERE wallet_id = ?'
        ).get(wallet.id) as { balance_wei: string; updated_at: number } | undefined;

        if (cached && (now - cached.updated_at) < maxAge) {
          const config = CHAIN_CONFIG[wallet.chain];
          const threshold = LOW_BALANCE_THRESHOLDS[wallet.chain] || BigInt(0);
          cachedBalances.push({
            walletId: wallet.id,
            address: wallet.address,
            chain: wallet.chain,
            balanceWei: cached.balance_wei,
            balanceFormatted: ethers.formatEther(BigInt(cached.balance_wei)),
            symbol: config?.symbol || 'ETH',
            updatedAt: cached.updated_at,
            isLow: BigInt(cached.balance_wei) < threshold,
          });
        } else {
          allCached = false;
          break;
        }
      }

      if (allCached && cachedBalances.length === wallets.length) {
        const lowBalanceCount = cachedBalances.filter((b) => b.isLow).length;
        return res.json({
          success: true,
          data: cachedBalances,
          count: cachedBalances.length,
          lowBalanceCount,
          cached: true,
        });
      }
    }

    // Fetch balances in parallel for performance
    const balancePromises = wallets.map(async (wallet) => {
      try {
        return await getWalletBalance(wallet);
      } catch (error) {
        console.error(`Error fetching balance for ${wallet.address}:`, error);
        return null;
      }
    });

    const results = await Promise.allSettled(balancePromises);
    const balances: WalletBalance[] = results
      .filter((r): r is PromiseFulfilledResult<WalletBalance | null> => r.status === 'fulfilled' && r.value !== null)
      .map((r) => r.value!);

    const lowBalanceCount = balances.filter((b) => b.isLow).length;

    res.json({
      success: true,
      data: balances,
      count: balances.length,
      lowBalanceCount,
      cached: false,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/wallets/low-balance
 * Get wallets with low balance
 */
router.get('/low-balance', async (req: Request, res: Response) => {
  try {
    const wallets = db.prepare('SELECT * FROM wallets WHERE is_active = 1').all().map(rowToWallet);
    const lowBalanceWallets: WalletBalance[] = [];

    for (const wallet of wallets) {
      try {
        const balance = await getWalletBalance(wallet);
        if (balance.isLow) {
          lowBalanceWallets.push(balance);
        }
      } catch (error) {
        console.error(`Error fetching balance for ${wallet.address}:`, error);
      }
    }

    res.json({
      success: true,
      data: lowBalanceWallets,
      count: lowBalanceWallets.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/wallets/:id
 * Get a specific wallet by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT * FROM wallets WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found',
      });
    }

    const wallet = rowToWallet(row);
    let balance: WalletBalance | null = null;

    try {
      balance = await getWalletBalance(wallet);
    } catch (error) {
      console.error('Error fetching balance:', error);
    }

    const assignments = db.prepare(
      'SELECT * FROM wallet_assignments WHERE wallet_id = ?'
    ).all(req.params.id);

    const fundingHistory = db.prepare(
      'SELECT * FROM funding_transactions WHERE to_wallet_id = ? OR from_wallet_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.params.id, req.params.id);

    res.json({
      success: true,
      data: {
        wallet,
        balance,
        assignments,
        fundingHistory,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/wallets/generate
 * Generate a new wallet
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { chain, role, label } = req.body;

    if (!chain || !role) {
      return res.status(400).json({
        success: false,
        error: 'chain and role are required',
      });
    }

    const seedPhrase = process.env.MASTER_SEED_PHRASE;
    if (!seedPhrase) {
      return res.status(500).json({
        success: false,
        error: 'Master seed phrase not configured (set MASTER_SEED_PHRASE env var)',
      });
    }

    // In ethers v6, use fromSeed to get the true master node at depth 0
    const mnemonic = ethers.Mnemonic.fromPhrase(seedPhrase);
    const seed = mnemonic.computeSeed();
    const masterNode = ethers.HDNodeWallet.fromSeed(seed);

    // Now derive the child wallet using full BIP-44 path from master (depth 0)
    const derivationPath = `m/44'/60'/0'/0/${walletIndex}`;
    const childNode = masterNode.derivePath(derivationPath);

    const chainConfig = CHAIN_CONFIG[chain];
    const walletLabel = label || `${chainConfig?.name || 'Chain-' + chain}-${role}-${walletIndex}`;

    const wallet: ManagedWallet = {
      id: randomUUID(),
      address: childNode.address.toLowerCase(),
      chain: chain as ChainId,
      role: role as WalletRole,
      label: walletLabel,
      derivationPath,
      createdAt: Date.now(),
      lastFundedAt: null,
      isActive: true,
    };

    db.prepare(`
      INSERT INTO wallets (id, address, chain, role, label, derivation_path, created_at, last_funded_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      wallet.id,
      wallet.address,
      wallet.chain,
      wallet.role,
      wallet.label,
      wallet.derivationPath,
      wallet.createdAt,
      wallet.lastFundedAt,
      wallet.isActive ? 1 : 0
    );

    walletIndex++;

    console.log(`Generated wallet: ${wallet.label} (${wallet.address})`);

    res.json({
      success: true,
      data: { wallet },
      message: `Wallet ${wallet.address} generated successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/wallets/:id/fund
 * Fund a specific wallet (placeholder - requires private key access)
 */
router.post('/:id/fund', async (req: Request, res: Response) => {
  try {
    res.status(501).json({
      success: false,
      error: 'Funding requires KEYMAKER agent with vault access. Use CLI or run full agent.',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/wallets/auto-fund
 * Auto-fund all low balance wallets (placeholder)
 */
router.post('/auto-fund', async (req: Request, res: Response) => {
  try {
    res.status(501).json({
      success: false,
      error: 'Auto-funding requires KEYMAKER agent with vault access. Use CLI or run full agent.',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/wallets/:id/authorize
 * Record wallet authorization on a contract
 */
router.post('/:id/authorize', async (req: Request, res: Response) => {
  try {
    const { contractAddress, chain, txHash } = req.body;

    if (!contractAddress || !chain || !txHash) {
      return res.status(400).json({
        success: false,
        error: 'contractAddress, chain, and txHash are required',
      });
    }

    db.prepare(`
      INSERT INTO wallet_assignments (wallet_id, contract_address, chain, authorized_at, tx_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.params.id, contractAddress.toLowerCase(), chain, Date.now(), txHash);

    res.json({
      success: true,
      message: 'Authorization recorded',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/wallets/monitoring/start
 * Start balance monitoring
 */
router.post('/monitoring/start', (req: Request, res: Response) => {
  try {
    if (monitoringInterval) {
      return res.json({
        success: true,
        message: 'Monitoring already running',
      });
    }

    monitoringInterval = setInterval(async () => {
      console.log('[Wallet Monitor] Checking balances...');
      const wallets = db.prepare('SELECT * FROM wallets WHERE is_active = 1').all().map(rowToWallet);
      let lowCount = 0;

      for (const wallet of wallets) {
        try {
          const balance = await getWalletBalance(wallet);
          if (balance.isLow) {
            lowCount++;
            console.log(`[Wallet Monitor] Low balance: ${wallet.label} - ${balance.balanceFormatted} ${balance.symbol}`);
          }
        } catch (error) {
          // Ignore individual balance fetch errors
        }
      }

      if (lowCount > 0) {
        console.log(`[Wallet Monitor] ${lowCount} wallets have low balance`);
      }
    }, 60000); // Check every minute

    res.json({
      success: true,
      message: 'Balance monitoring started',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/wallets/monitoring/stop
 * Stop balance monitoring
 */
router.post('/monitoring/stop', (req: Request, res: Response) => {
  try {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }

    res.json({
      success: true,
      message: 'Balance monitoring stopped',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
