/**
 * Smart Contract Viewer API Routes
 *
 * Provides contract information, events, and transaction history.
 */

import { Router, Request, Response } from 'express';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ContractDeployment {
  name: string;
  address: string;
  chain: string;
  chainId: number;
  explorer: string;
  abi?: any[];
  verified: boolean;
  deployedAt: string;
  configuration?: Record<string, any>;
}

interface ContractEvent {
  name: string;
  signature: string;
  inputs: Array<{ name: string; type: string; indexed: boolean }>;
}

interface ContractFunction {
  name: string;
  signature: string;
  stateMutability: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
}

// Chain RPC configurations
const CHAIN_RPCS: Record<number, string> = {
  1: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
  56: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
  11155111: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
  42161: process.env.ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc',
};

// Provider cache
const providers: Map<number, ethers.JsonRpcProvider> = new Map();
function getProvider(chainId: number): ethers.JsonRpcProvider {
  if (!providers.has(chainId)) {
    const rpc = CHAIN_RPCS[chainId];
    if (!rpc) throw new Error(`No RPC for chain ${chainId}`);
    providers.set(chainId, new ethers.JsonRpcProvider(rpc));
  }
  return providers.get(chainId)!;
}

const router = Router();

/**
 * GET /api/contracts
 * List all deployed contracts
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const deploymentsDir = join(__dirname, '../../../../deployments');
    const contracts: ContractDeployment[] = [];

    if (existsSync(deploymentsDir)) {
      const files = readdirSync(deploymentsDir).filter((f) => f.endsWith('.json'));

      for (const file of files) {
        try {
          const deployment = JSON.parse(readFileSync(join(deploymentsDir, file), 'utf-8'));
          const chain = file.replace('.json', '');

          for (const [name, address] of Object.entries(deployment.contracts || {})) {
            contracts.push({
              name,
              address: address as string,
              chain,
              chainId: deployment.chainId,
              explorer: deployment.explorer?.[name] || '',
              verified: deployment.verified || false,
              deployedAt: deployment.deployedAt || '',
              configuration: deployment.configuration,
            });
          }
        } catch {
          // Skip invalid files
        }
      }
    }

    res.json({
      success: true,
      data: contracts,
      count: contracts.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/contracts/:address
 * Get detailed contract information
 */
router.get('/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const chainId = parseInt(req.query.chainId as string) || 11155111;

    // Find the contract in deployments
    const deploymentsDir = join(__dirname, '../../../../deployments');
    let contractInfo: ContractDeployment | null = null;
    let abi: any[] = [];

    if (existsSync(deploymentsDir)) {
      const files = readdirSync(deploymentsDir).filter((f) => f.endsWith('.json'));

      for (const file of files) {
        try {
          const deployment = JSON.parse(readFileSync(join(deploymentsDir, file), 'utf-8'));

          for (const [name, addr] of Object.entries(deployment.contracts || {})) {
            if ((addr as string).toLowerCase() === address.toLowerCase()) {
              contractInfo = {
                name,
                address: addr as string,
                chain: file.replace('.json', ''),
                chainId: deployment.chainId,
                explorer: deployment.explorer?.[name] || '',
                verified: deployment.verified || false,
                deployedAt: deployment.deployedAt || '',
                configuration: deployment.configuration,
              };

              // Try to load ABI from build artifacts
              const abiPath = join(__dirname, `../../../../contracts/out/${name}.sol/${name}.json`);
              if (existsSync(abiPath)) {
                const artifact = JSON.parse(readFileSync(abiPath, 'utf-8'));
                abi = artifact.abi || [];
              }

              break;
            }
          }
        } catch {
          // Skip invalid files
        }
      }
    }

    if (!contractInfo) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found in deployments',
      });
    }

    // Parse ABI into functions and events
    const functions: ContractFunction[] = [];
    const events: ContractEvent[] = [];

    for (const item of abi) {
      if (item.type === 'function') {
        functions.push({
          name: item.name,
          signature: `${item.name}(${(item.inputs || []).map((i: any) => i.type).join(',')})`,
          stateMutability: item.stateMutability || 'nonpayable',
          inputs: (item.inputs || []).map((i: any) => ({ name: i.name, type: i.type })),
          outputs: (item.outputs || []).map((o: any) => ({ name: o.name, type: o.type })),
        });
      } else if (item.type === 'event') {
        events.push({
          name: item.name,
          signature: `${item.name}(${(item.inputs || []).map((i: any) => i.type).join(',')})`,
          inputs: (item.inputs || []).map((i: any) => ({
            name: i.name,
            type: i.type,
            indexed: i.indexed || false,
          })),
        });
      }
    }

    // Get contract code size
    let codeSize = 0;
    try {
      const provider = getProvider(contractInfo.chainId);
      const code = await provider.getCode(address);
      codeSize = (code.length - 2) / 2; // Remove 0x prefix, divide by 2 for bytes
    } catch {
      // Ignore errors
    }

    res.json({
      success: true,
      data: {
        ...contractInfo,
        abi,
        functions,
        events,
        codeSize,
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
 * GET /api/contracts/:address/events
 * Get recent contract events
 */
router.get('/:address/events', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const chainId = parseInt(req.query.chainId as string) || 11155111;
    const fromBlock = req.query.fromBlock ? parseInt(req.query.fromBlock as string) : -1000;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const provider = getProvider(chainId);

    // Get current block
    const currentBlock = await provider.getBlockNumber();
    const startBlock = fromBlock < 0 ? currentBlock + fromBlock : fromBlock;

    // Fetch logs
    const logs = await provider.getLogs({
      address,
      fromBlock: startBlock,
      toBlock: currentBlock,
    });

    // Format events
    const events = logs.slice(-limit).map((log) => ({
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
      topics: log.topics,
      data: log.data,
      logIndex: log.index,
    }));

    res.json({
      success: true,
      data: events,
      count: events.length,
      fromBlock: startBlock,
      toBlock: currentBlock,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/contracts/:address/executions
 * Get our bot's execution history for this contract
 */
router.get('/:address/executions', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Load executions from our database
    const dbPath = join(__dirname, '../../db/matrix.db');
    if (!existsSync(dbPath)) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: 'No execution database found',
      });
    }

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);

    // Get recent executions (our bot's history)
    const executions = db.prepare(`
      SELECT
        id, tx_hash, chain, status,
        route_token_symbols, route_dexes,
        expected_profit_wei, actual_profit_wei, net_profit_wei,
        gas_used, gas_cost_wei,
        submitted_at, confirmed_at, execution_time_ms,
        was_frontrun, error_message
      FROM executions
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);

    db.close();

    res.json({
      success: true,
      data: executions,
      count: executions.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/contracts/:address/call
 * Call a read-only contract function
 */
router.post('/:address/call', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { functionName, args = [], abi } = req.body;
    const chainId = parseInt(req.query.chainId as string) || 11155111;

    if (!functionName || !abi) {
      return res.status(400).json({
        success: false,
        error: 'functionName and abi are required',
      });
    }

    const provider = getProvider(chainId);
    const contract = new ethers.Contract(address, abi, provider);

    const result = await contract[functionName](...args);

    res.json({
      success: true,
      data: {
        result: result.toString ? result.toString() : result,
        type: typeof result,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
