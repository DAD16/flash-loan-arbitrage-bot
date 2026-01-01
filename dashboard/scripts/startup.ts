#!/usr/bin/env npx tsx
/**
 * Matrix Command Center - One-Button Startup Script
 *
 * Starts all services, verifies connections, and opens the dashboard.
 * Usage: npm run start
 */

import { spawn, ChildProcess } from 'child_process';
import { createPublicClient, http, formatEther, type Chain } from 'viem';
import { mainnet, arbitrum, optimism, base, bsc, sepolia } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const envPath = path.resolve(projectRoot, '..', '.env');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}[OK]${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  header: (msg: string) => console.log(`\n${colors.bright}${colors.magenta}${msg}${colors.reset}`),
};

// Matrix banner
function showBanner() {
  console.log(`
${colors.green}
  ███╗   ███╗ █████╗ ████████╗██████╗ ██╗██╗  ██╗
  ████╗ ████║██╔══██╗╚══██╔══╝██╔══██╗██║╚██╗██╔╝
  ██╔████╔██║███████║   ██║   ██████╔╝██║ ╚███╔╝
  ██║╚██╔╝██║██╔══██║   ██║   ██╔══██╗██║ ██╔██╗
  ██║ ╚═╝ ██║██║  ██║   ██║   ██║  ██║██║██╔╝ ██╗
  ╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝

         COMMAND CENTER - Startup Sequence
${colors.reset}
  `);
}

// Load environment variables from .env file
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;

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
  name: string;
  chain: Chain;
  rpcEnvVar: string;
  symbol: string;
}

const chains: ChainConfig[] = [
  { name: 'Sepolia', chain: sepolia, rpcEnvVar: 'SEPOLIA_RPC_URL', symbol: 'ETH' },
  { name: 'BSC', chain: bsc, rpcEnvVar: 'BSC_RPC_URL', symbol: 'BNB' },
  { name: 'Ethereum', chain: mainnet, rpcEnvVar: 'ETH_RPC_URL', symbol: 'ETH' },
  { name: 'Arbitrum', chain: arbitrum, rpcEnvVar: 'ARB_RPC_URL', symbol: 'ETH' },
  { name: 'Optimism', chain: optimism, rpcEnvVar: 'OP_RPC_URL', symbol: 'ETH' },
  { name: 'Base', chain: base, rpcEnvVar: 'BASE_RPC_URL', symbol: 'ETH' },
];

// Verify RPC connection
async function verifyRpcConnection(config: ChainConfig, rpcUrl: string): Promise<{
  success: boolean;
  blockNumber?: bigint;
  latency?: number;
  error?: string;
}> {
  const start = Date.now();

  try {
    const client = createPublicClient({
      chain: config.chain,
      transport: http(rpcUrl, { timeout: 10000 }),
    });

    const blockNumber = await client.getBlockNumber();
    const latency = Date.now() - start;

    return { success: true, blockNumber, latency };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Check wallet configuration
async function checkWallet(env: Record<string, string>): Promise<{
  configured: boolean;
  address?: string;
}> {
  const privateKey = env.PRIVATE_KEY;

  if (!privateKey || privateKey.length < 64) {
    return { configured: false };
  }

  try {
    // Import viem's privateKeyToAccount
    const { privateKeyToAccount } = await import('viem/accounts');
    const pk = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const account = privateKeyToAccount(pk as `0x${string}`);
    return { configured: true, address: account.address };
  } catch {
    return { configured: false };
  }
}

// Check wallet balance on a chain
async function getWalletBalance(
  rpcUrl: string,
  chain: Chain,
  address: string
): Promise<string | null> {
  try {
    const client = createPublicClient({
      chain,
      transport: http(rpcUrl, { timeout: 10000 }),
    });

    const balance = await client.getBalance({ address: address as `0x${string}` });
    return formatEther(balance);
  } catch {
    return null;
  }
}

// Check if port is in use
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });

    server.listen(port);
  });
}

// Start a service
function startService(
  name: string,
  command: string,
  args: string[],
  cwd: string
): ChildProcess {
  const proc = spawn(command, args, {
    cwd,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  proc.stdout?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line: string) => {
      if (line.trim()) {
        console.log(`${colors.dim}[${name}]${colors.reset} ${line}`);
      }
    });
  });

  proc.stderr?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line: string) => {
      if (line.trim() && !line.includes('ExperimentalWarning')) {
        console.log(`${colors.dim}[${name}]${colors.reset} ${colors.yellow}${line}${colors.reset}`);
      }
    });
  });

  return proc;
}

// Wait for service to be ready
async function waitForService(
  url: string,
  name: string,
  maxAttempts: number = 30
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch {
      // Service not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// Main startup sequence
async function main() {
  showBanner();

  const env = loadEnv();
  let hasErrors = false;
  const processes: ChildProcess[] = [];

  // ============ Step 1: Check Environment ============
  log.header('Step 1: Checking Environment Configuration');

  const requiredEnvVars = ['BSC_RPC_URL'];
  const missingVars = requiredEnvVars.filter(v => !env[v] || env[v] === 'YOUR_KEY');

  if (missingVars.length > 0) {
    log.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    log.info('Please configure your .env file');
    hasErrors = true;
  } else {
    log.success('Environment configuration loaded');
  }

  // ============ Step 2: Verify RPC Connections ============
  log.header('Step 2: Verifying RPC Connections');

  const connectionResults: { chain: string; success: boolean; block?: string; latency?: string }[] = [];

  for (const chainConfig of chains) {
    const rpcUrl = env[chainConfig.rpcEnvVar];

    if (!rpcUrl || rpcUrl.includes('YOUR_KEY')) {
      log.warn(`${chainConfig.name}: Not configured (${chainConfig.rpcEnvVar})`);
      connectionResults.push({ chain: chainConfig.name, success: false });
      continue;
    }

    const result = await verifyRpcConnection(chainConfig, rpcUrl);

    if (result.success) {
      log.success(
        `${chainConfig.name}: Connected (Block #${result.blockNumber}, ${result.latency}ms)`
      );
      connectionResults.push({
        chain: chainConfig.name,
        success: true,
        block: result.blockNumber?.toString(),
        latency: `${result.latency}ms`
      });
    } else {
      log.error(`${chainConfig.name}: Failed - ${result.error}`);
      connectionResults.push({ chain: chainConfig.name, success: false });
      hasErrors = true;
    }
  }

  // ============ Step 3: Check Wallet ============
  log.header('Step 3: Checking Wallet Configuration');

  const walletResult = await checkWallet(env);

  if (walletResult.configured && walletResult.address) {
    log.success(`Wallet configured: ${walletResult.address.slice(0, 6)}...${walletResult.address.slice(-4)}`);

    // Check balances on configured chains
    for (const chainConfig of chains) {
      const rpcUrl = env[chainConfig.rpcEnvVar];
      if (rpcUrl && !rpcUrl.includes('YOUR_KEY')) {
        const balance = await getWalletBalance(rpcUrl, chainConfig.chain, walletResult.address);
        if (balance !== null) {
          const balanceNum = parseFloat(balance);
          const status = balanceNum > 0 ? colors.green : colors.yellow;
          console.log(`  ${status}${chainConfig.name}: ${parseFloat(balance).toFixed(4)} ${chainConfig.symbol}${colors.reset}`);
        }
      }
    }
  } else {
    log.warn('Wallet not configured (PRIVATE_KEY missing or invalid)');
    log.info('Execution features will be disabled until wallet is configured');
  }

  // ============ Step 4: Check Database ============
  log.header('Step 4: Checking Database');

  const dbPath = path.join(projectRoot, 'db', 'matrix.db');
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    log.success(`Database exists (${(stats.size / 1024).toFixed(1)} KB)`);
  } else {
    log.warn('Database not found - will be created on first run');
    log.info('Run: npm run db:setup && npm run db:seed-sample');
  }

  // ============ Step 5: Start Services ============
  log.header('Step 5: Starting Services');

  // Check if ports are in use
  const apiPort = 9081;
  const vitePort = 9080;

  const apiInUse = await isPortInUse(apiPort);
  const viteInUse = await isPortInUse(vitePort);

  if (apiInUse) {
    log.warn(`API server port ${apiPort} already in use - assuming it's running`);
  } else {
    log.info('Starting API server on port 9081...');
    const apiProc = startService('API', 'npx', ['tsx', 'src/api/server.ts'], projectRoot);
    processes.push(apiProc);

    // Wait for API to be ready
    const apiReady = await waitForService('http://localhost:9081/api/health', 'API');
    if (apiReady) {
      log.success('API server started successfully');
    } else {
      log.error('API server failed to start');
      hasErrors = true;
    }
  }

  if (viteInUse) {
    log.warn(`Vite dev server port ${vitePort} already in use - assuming it's running`);
  } else {
    log.info('Starting Vite dev server on port 9080...');
    const viteProc = startService('Vite', 'npx', ['vite', '--port', '9080'], projectRoot);
    processes.push(viteProc);

    // Wait for Vite to be ready
    const viteReady = await waitForService('http://localhost:9080', 'Vite');
    if (viteReady) {
      log.success('Vite dev server started successfully');
    } else {
      log.error('Vite dev server failed to start');
      hasErrors = true;
    }
  }

  // ============ Summary ============
  log.header('Startup Complete');

  console.log(`
${colors.bright}Services Status:${colors.reset}
  ${colors.green}Dashboard:${colors.reset}  http://localhost:9080
  ${colors.green}API:${colors.reset}        http://localhost:9081/api

${colors.bright}Chain Connections:${colors.reset}`);

  connectionResults.forEach(r => {
    const icon = r.success ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    const details = r.success ? ` (Block ${r.block}, ${r.latency})` : ' (Not connected)';
    console.log(`  ${icon} ${r.chain}${colors.dim}${details}${colors.reset}`);
  });

  if (walletResult.configured) {
    console.log(`
${colors.bright}Wallet:${colors.reset}
  ${colors.green}✓${colors.reset} ${walletResult.address?.slice(0, 6)}...${walletResult.address?.slice(-4)}`);
  } else {
    console.log(`
${colors.bright}Wallet:${colors.reset}
  ${colors.yellow}⚠${colors.reset} Not configured`);
  }

  console.log(`
${colors.bright}${colors.green}Press Ctrl+C to stop all services${colors.reset}
`);

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down...');
    processes.forEach(p => p.kill());
    process.exit(0);
  });

  // Keep the process running
  await new Promise(() => {});
}

main().catch(console.error);
