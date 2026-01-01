/**
 * Wallet Management API Routes
 *
 * Provides endpoints for the dashboard to manage wallets via KEYMAKER.
 */

import { Router, Request, Response } from 'express';
import { WalletManager } from '@matrix/keymaker';
import type { ChainId, WalletRole } from '@matrix/keymaker';

let walletManager: WalletManager | null = null;

export function setWalletManager(manager: WalletManager): void {
  walletManager = manager;
}

const router = Router();

// Middleware to check if wallet manager is initialized
const requireWalletManager = (req: Request, res: Response, next: Function) => {
  if (!walletManager) {
    return res.status(503).json({
      success: false,
      error: 'Wallet manager not initialized',
    });
  }
  next();
};

router.use(requireWalletManager);

/**
 * GET /api/wallets
 * List all managed wallets
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const chain = req.query.chain ? parseInt(req.query.chain as string, 10) as ChainId : undefined;
    const role = req.query.role as WalletRole | undefined;

    let wallets;
    if (chain) {
      wallets = walletManager!.getWalletsByChain(chain);
    } else if (role) {
      wallets = walletManager!.getWalletsByRole(role);
    } else {
      wallets = walletManager!.getAllWallets();
    }

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
    const summary = await walletManager!.getSummary();
    res.json({
      success: true,
      data: summary,
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
 * Get all wallet balances
 */
router.get('/balances', async (req: Request, res: Response) => {
  try {
    const balances = await walletManager!.getAllBalances();
    const lowBalanceCount = balances.filter((b) => b.isLow).length;

    res.json({
      success: true,
      data: balances,
      count: balances.length,
      lowBalanceCount,
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
    const lowBalanceWallets = await walletManager!.getLowBalanceWallets();

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
    const wallet = walletManager!.getWallet(req.params.id);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found',
      });
    }

    // Get balance
    const balance = await walletManager!.getWalletBalance(req.params.id);

    // Get assignments
    const assignments = walletManager!.getWalletAssignments(req.params.id);

    // Get funding history
    const fundingHistory = walletManager!.getFundingHistory(req.params.id);

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

    const result = await walletManager!.generateWallet(
      chain as ChainId,
      role as WalletRole,
      label || `${role}-${Date.now()}`
    );

    // Don't return private key in response for security
    res.json({
      success: true,
      data: {
        wallet: result.wallet,
        // privateKey is intentionally omitted
      },
      message: `Wallet ${result.wallet.address} generated successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/wallets/generate/executor
 * Generate a new executor wallet
 */
router.post('/generate/executor', async (req: Request, res: Response) => {
  try {
    const { chain, label } = req.body;

    if (!chain) {
      return res.status(400).json({
        success: false,
        error: 'chain is required',
      });
    }

    const result = await walletManager!.generateExecutorWallet(chain as ChainId, label);

    res.json({
      success: true,
      data: {
        wallet: result.wallet,
      },
      message: `Executor wallet ${result.wallet.address} generated successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/wallets/generate/gas-reserve
 * Generate a new gas reserve wallet
 */
router.post('/generate/gas-reserve', async (req: Request, res: Response) => {
  try {
    const { chain } = req.body;

    if (!chain) {
      return res.status(400).json({
        success: false,
        error: 'chain is required',
      });
    }

    const result = await walletManager!.generateGasReserveWallet(chain as ChainId);

    res.json({
      success: true,
      data: {
        wallet: result.wallet,
      },
      message: `Gas reserve wallet ${result.wallet.address} generated successfully`,
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
 * Fund a specific wallet from gas reserve
 */
router.post('/:id/fund', async (req: Request, res: Response) => {
  try {
    const { amountWei } = req.body;
    const tx = await walletManager!.fundWallet(req.params.id, amountWei);

    if (!tx) {
      return res.status(400).json({
        success: false,
        error: 'Unable to fund wallet (no gas reserve or insufficient balance)',
      });
    }

    res.json({
      success: true,
      data: tx,
      message: `Funding transaction ${tx.txHash} submitted`,
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
 * Auto-fund all low balance wallets
 */
router.post('/auto-fund', async (req: Request, res: Response) => {
  try {
    const transactions = await walletManager!.autoFundLowBalanceWallets();

    res.json({
      success: true,
      data: transactions,
      count: transactions.length,
      message: `${transactions.length} funding transactions submitted`,
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

    walletManager!.recordAuthorization(
      req.params.id,
      contractAddress,
      chain as ChainId,
      txHash
    );

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
    walletManager!.startMonitoring();
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
    walletManager!.stopMonitoring();
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
