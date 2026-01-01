/**
 * KEYMAKER - Wallet Database
 *
 * SQLite database for tracking managed wallets, assignments, and funding history.
 */

import Database from 'better-sqlite3';
import { AgentLogger } from '@matrix/shared';
import type {
  ManagedWallet,
  WalletAssignment,
  WalletBalance,
  FundingTransaction,
  ChainId,
  WalletRole,
} from './types.js';

export class WalletDatabase {
  private db: Database.Database;
  private logger: AgentLogger;

  constructor(dbPath: string) {
    this.logger = new AgentLogger('KEYMAKER-DB');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
    this.logger.info(`Database initialized at ${dbPath}`);
  }

  private initSchema(): void {
    this.db.exec(`
      -- Managed wallets table
      CREATE TABLE IF NOT EXISTS wallets (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL UNIQUE,
        chain INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('master', 'gas_reserve', 'executor')),
        label TEXT NOT NULL,
        derivation_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_funded_at INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      -- Wallet to contract assignments
      CREATE TABLE IF NOT EXISTS wallet_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id TEXT NOT NULL REFERENCES wallets(id),
        contract_address TEXT NOT NULL,
        chain INTEGER NOT NULL,
        authorized_at INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        UNIQUE(wallet_id, contract_address, chain)
      );

      -- Wallet balances (cached)
      CREATE TABLE IF NOT EXISTS wallet_balances (
        wallet_id TEXT PRIMARY KEY REFERENCES wallets(id),
        balance_wei TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Funding transaction history
      CREATE TABLE IF NOT EXISTS funding_transactions (
        id TEXT PRIMARY KEY,
        from_wallet_id TEXT NOT NULL REFERENCES wallets(id),
        to_wallet_id TEXT NOT NULL REFERENCES wallets(id),
        chain INTEGER NOT NULL,
        amount_wei TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'confirmed', 'failed')),
        created_at INTEGER NOT NULL,
        confirmed_at INTEGER
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_wallets_chain ON wallets(chain);
      CREATE INDEX IF NOT EXISTS idx_wallets_role ON wallets(role);
      CREATE INDEX IF NOT EXISTS idx_wallets_active ON wallets(is_active);
      CREATE INDEX IF NOT EXISTS idx_assignments_wallet ON wallet_assignments(wallet_id);
      CREATE INDEX IF NOT EXISTS idx_funding_to_wallet ON funding_transactions(to_wallet_id);
      CREATE INDEX IF NOT EXISTS idx_funding_status ON funding_transactions(status);
    `);
  }

  // ============================================
  // Wallet CRUD Operations
  // ============================================

  createWallet(wallet: ManagedWallet): void {
    const stmt = this.db.prepare(`
      INSERT INTO wallets (id, address, chain, role, label, derivation_path, created_at, last_funded_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
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
    this.logger.info(`Created wallet: ${wallet.label} (${wallet.address})`);
  }

  getWallet(id: string): ManagedWallet | null {
    const stmt = this.db.prepare('SELECT * FROM wallets WHERE id = ?');
    const row = stmt.get(id) as WalletRow | undefined;
    return row ? this.rowToWallet(row) : null;
  }

  getWalletByAddress(address: string): ManagedWallet | null {
    const stmt = this.db.prepare('SELECT * FROM wallets WHERE address = ?');
    const row = stmt.get(address.toLowerCase()) as WalletRow | undefined;
    return row ? this.rowToWallet(row) : null;
  }

  getAllWallets(): ManagedWallet[] {
    const stmt = this.db.prepare('SELECT * FROM wallets WHERE is_active = 1 ORDER BY created_at DESC');
    const rows = stmt.all() as WalletRow[];
    return rows.map(this.rowToWallet);
  }

  getWalletsByChain(chain: ChainId): ManagedWallet[] {
    const stmt = this.db.prepare('SELECT * FROM wallets WHERE chain = ? AND is_active = 1');
    const rows = stmt.all(chain) as WalletRow[];
    return rows.map(this.rowToWallet);
  }

  getWalletsByRole(role: WalletRole): ManagedWallet[] {
    const stmt = this.db.prepare('SELECT * FROM wallets WHERE role = ? AND is_active = 1');
    const rows = stmt.all(role) as WalletRow[];
    return rows.map(this.rowToWallet);
  }

  getGasReserveWallet(chain: ChainId): ManagedWallet | null {
    const stmt = this.db.prepare(
      'SELECT * FROM wallets WHERE chain = ? AND role = ? AND is_active = 1 LIMIT 1'
    );
    const row = stmt.get(chain, 'gas_reserve') as WalletRow | undefined;
    return row ? this.rowToWallet(row) : null;
  }

  updateWalletLastFunded(walletId: string, timestamp: number): void {
    const stmt = this.db.prepare('UPDATE wallets SET last_funded_at = ? WHERE id = ?');
    stmt.run(timestamp, walletId);
  }

  deactivateWallet(walletId: string): void {
    const stmt = this.db.prepare('UPDATE wallets SET is_active = 0 WHERE id = ?');
    stmt.run(walletId);
    this.logger.warn(`Deactivated wallet: ${walletId}`);
  }

  // ============================================
  // Wallet Assignments
  // ============================================

  createAssignment(assignment: WalletAssignment): void {
    const stmt = this.db.prepare(`
      INSERT INTO wallet_assignments (wallet_id, contract_address, chain, authorized_at, tx_hash)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      assignment.walletId,
      assignment.contractAddress.toLowerCase(),
      assignment.chain,
      assignment.authorizedAt,
      assignment.txHash
    );
    this.logger.info(`Created assignment: wallet ${assignment.walletId} → contract ${assignment.contractAddress}`);
  }

  getAssignmentsForWallet(walletId: string): WalletAssignment[] {
    const stmt = this.db.prepare('SELECT * FROM wallet_assignments WHERE wallet_id = ?');
    const rows = stmt.all(walletId) as AssignmentRow[];
    return rows.map(this.rowToAssignment);
  }

  getAssignmentsForContract(contractAddress: string, chain: ChainId): WalletAssignment[] {
    const stmt = this.db.prepare(
      'SELECT * FROM wallet_assignments WHERE contract_address = ? AND chain = ?'
    );
    const rows = stmt.all(contractAddress.toLowerCase(), chain) as AssignmentRow[];
    return rows.map(this.rowToAssignment);
  }

  // ============================================
  // Wallet Balances
  // ============================================

  updateBalance(walletId: string, balanceWei: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO wallet_balances (wallet_id, balance_wei, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(wallet_id) DO UPDATE SET balance_wei = ?, updated_at = ?
    `);
    const now = Date.now();
    stmt.run(walletId, balanceWei, now, balanceWei, now);
  }

  getBalance(walletId: string): { balanceWei: string; updatedAt: number } | null {
    const stmt = this.db.prepare('SELECT balance_wei, updated_at FROM wallet_balances WHERE wallet_id = ?');
    const row = stmt.get(walletId) as { balance_wei: string; updated_at: number } | undefined;
    return row ? { balanceWei: row.balance_wei, updatedAt: row.updated_at } : null;
  }

  getAllBalances(): Map<string, { balanceWei: string; updatedAt: number }> {
    const stmt = this.db.prepare('SELECT wallet_id, balance_wei, updated_at FROM wallet_balances');
    const rows = stmt.all() as { wallet_id: string; balance_wei: string; updated_at: number }[];
    const map = new Map<string, { balanceWei: string; updatedAt: number }>();
    for (const row of rows) {
      map.set(row.wallet_id, { balanceWei: row.balance_wei, updatedAt: row.updated_at });
    }
    return map;
  }

  // ============================================
  // Funding Transactions
  // ============================================

  createFundingTransaction(tx: FundingTransaction): void {
    const stmt = this.db.prepare(`
      INSERT INTO funding_transactions (id, from_wallet_id, to_wallet_id, chain, amount_wei, tx_hash, status, created_at, confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      tx.id,
      tx.fromWalletId,
      tx.toWalletId,
      tx.chain,
      tx.amountWei,
      tx.txHash,
      tx.status,
      tx.createdAt,
      tx.confirmedAt
    );
    this.logger.info(`Created funding tx: ${tx.txHash}`);
  }

  updateFundingTransactionStatus(txId: string, status: 'pending' | 'confirmed' | 'failed', confirmedAt?: number): void {
    const stmt = this.db.prepare(
      'UPDATE funding_transactions SET status = ?, confirmed_at = ? WHERE id = ?'
    );
    stmt.run(status, confirmedAt ?? null, txId);
  }

  getFundingHistory(walletId: string, limit = 50): FundingTransaction[] {
    const stmt = this.db.prepare(`
      SELECT * FROM funding_transactions
      WHERE to_wallet_id = ? OR from_wallet_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(walletId, walletId, limit) as FundingRow[];
    return rows.map(this.rowToFunding);
  }

  getPendingFundingTransactions(): FundingTransaction[] {
    const stmt = this.db.prepare("SELECT * FROM funding_transactions WHERE status = 'pending'");
    const rows = stmt.all() as FundingRow[];
    return rows.map(this.rowToFunding);
  }

  // ============================================
  // Statistics
  // ============================================

  getWalletCounts(): { byChain: Record<number, number>; byRole: Record<string, number>; total: number } {
    const chainStmt = this.db.prepare(
      'SELECT chain, COUNT(*) as count FROM wallets WHERE is_active = 1 GROUP BY chain'
    );
    const roleStmt = this.db.prepare(
      'SELECT role, COUNT(*) as count FROM wallets WHERE is_active = 1 GROUP BY role'
    );
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM wallets WHERE is_active = 1');

    const chainRows = chainStmt.all() as { chain: number; count: number }[];
    const roleRows = roleStmt.all() as { role: string; count: number }[];
    const totalRow = totalStmt.get() as { count: number };

    const byChain: Record<number, number> = {};
    for (const row of chainRows) {
      byChain[row.chain] = row.count;
    }

    const byRole: Record<string, number> = {};
    for (const row of roleRows) {
      byRole[row.role] = row.count;
    }

    return { byChain, byRole, total: totalRow.count };
  }

  // ============================================
  // Helpers
  // ============================================

  private rowToWallet(row: WalletRow): ManagedWallet {
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

  private rowToAssignment(row: AssignmentRow): WalletAssignment {
    return {
      walletId: row.wallet_id,
      contractAddress: row.contract_address,
      chain: row.chain as ChainId,
      authorizedAt: row.authorized_at,
      txHash: row.tx_hash,
    };
  }

  private rowToFunding(row: FundingRow): FundingTransaction {
    return {
      id: row.id,
      fromWalletId: row.from_wallet_id,
      toWalletId: row.to_wallet_id,
      chain: row.chain as ChainId,
      amountWei: row.amount_wei,
      txHash: row.tx_hash,
      status: row.status as 'pending' | 'confirmed' | 'failed',
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
    };
  }

  close(): void {
    this.db.close();
    this.logger.info('Database connection closed');
  }
}

// Row types for SQLite
interface WalletRow {
  id: string;
  address: string;
  chain: number;
  role: string;
  label: string;
  derivation_path: string;
  created_at: number;
  last_funded_at: number | null;
  is_active: number;
}

interface AssignmentRow {
  id: number;
  wallet_id: string;
  contract_address: string;
  chain: number;
  authorized_at: number;
  tx_hash: string;
}

interface FundingRow {
  id: string;
  from_wallet_id: string;
  to_wallet_id: string;
  chain: number;
  amount_wei: string;
  tx_hash: string;
  status: string;
  created_at: number;
  confirmed_at: number | null;
}
