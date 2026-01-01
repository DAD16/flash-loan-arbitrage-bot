/**
 * Database Setup Script
 * Initializes SQLite database with schema and seed data
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = join(__dirname, 'matrix.db');
const SCHEMA_PATH = join(__dirname, 'schema.sqlite.sql');

console.log('🔧 Setting up Matrix Command Center database...\n');

// Delete existing database to start fresh
if (existsSync(DB_PATH)) {
  console.log('🗑️  Removing existing database...');
  unlinkSync(DB_PATH);
}

// Create database
const db = new Database(DB_PATH);
console.log(`📁 Database: ${DB_PATH}`);

// Disable foreign keys during setup
db.pragma('foreign_keys = OFF');

// Read schema
const schema = readFileSync(SCHEMA_PATH, 'utf-8');

// Execute entire schema at once (SQLite handles multi-statement)
try {
  db.exec(schema);
  console.log('✅ Schema executed successfully');
} catch (err) {
  console.error('❌ Schema error:', err.message);
  process.exit(1);
}

// Re-enable foreign keys
db.pragma('foreign_keys = ON');

// Verify tables
const tables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all();

console.log(`\n📊 Tables created (${tables.length}):`);
tables.forEach(t => console.log(`   ✓ ${t.name}`));

// Show seed data
const dexCount = db.prepare('SELECT COUNT(*) as count FROM dexes').get();
const tokenCount = db.prepare('SELECT COUNT(*) as count FROM tokens').get();

if (dexCount.count > 0) {
  const dexes = db.prepare('SELECT name, router_address FROM dexes ORDER BY priority').all();
  console.log(`\n🔄 DEXes loaded (${dexes.length}):`);
  dexes.forEach(d => console.log(`   - ${d.name}: ${d.router_address.slice(0, 10)}...`));
}

if (tokenCount.count > 0) {
  const tokens = db.prepare('SELECT symbol, name FROM tokens ORDER BY priority').all();
  console.log(`\n🪙 Tokens loaded (${tokens.length}):`);
  tokens.forEach(t => console.log(`   - ${t.symbol}: ${t.name}`));
}

db.close();

console.log('\n✅ Database setup complete!');
console.log(`\n💡 Use this path in your application:`);
console.log(`   ${DB_PATH}`);
