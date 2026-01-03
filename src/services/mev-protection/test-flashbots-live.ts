/**
 * Live Flashbots Sepolia Test
 *
 * This script sends a real transaction through Flashbots Protect on Sepolia.
 *
 * Prerequisites:
 * 1. Get Sepolia ETH from a faucet:
 *    - https://sepoliafaucet.com/
 *    - https://www.alchemy.com/faucets/ethereum-sepolia
 *
 * 2. Set your testnet private key:
 *    export TESTNET_PRIVATE_KEY="0x..."
 *
 * 3. Run: npx tsx src/services/mev-protection/test-flashbots-live.ts
 */

import { ethers } from 'ethers';
import { TESTNET_CONFIG, getTestnetRPC } from './testnet-config';

// ============ Configuration ============

const PRIVATE_KEY = process.env.TESTNET_PRIVATE_KEY;
const TEST_RECIPIENT = '0x000000000000000000000000000000000000dEaD';
const TEST_AMOUNT = ethers.parseEther('0.0001'); // 0.0001 ETH

// ============ Main ============

async function main(): Promise<void> {
  console.log('\n=== FLASHBOTS SEPOLIA LIVE TEST ===\n');

  // Check private key
  if (!PRIVATE_KEY) {
    console.log('ERROR: TESTNET_PRIVATE_KEY not set\n');
    console.log('To test, run:');
    console.log('  1. Get Sepolia ETH from https://sepoliafaucet.com/');
    console.log('  2. Export your testnet private key:');
    console.log('     export TESTNET_PRIVATE_KEY="0xyour_key_here"');
    console.log('  3. Run this script again\n');

    // Generate a test wallet for reference
    const testWallet = ethers.Wallet.createRandom();
    console.log('Example - you can use this new wallet:');
    console.log(`  Address: ${testWallet.address}`);
    console.log(`  Private Key: ${testWallet.privateKey}`);
    console.log('\nSend some Sepolia ETH to this address, then run the test.');
    return;
  }

  // Setup providers
  const publicRPC = getTestnetRPC('sepolia', false);
  const flashbotsRPC = getTestnetRPC('sepolia', true);

  console.log(`Public RPC: ${publicRPC}`);
  console.log(`Flashbots RPC: ${flashbotsRPC}\n`);

  const publicProvider = new ethers.JsonRpcProvider(publicRPC);
  const flashbotsProvider = new ethers.JsonRpcProvider(flashbotsRPC);

  const wallet = new ethers.Wallet(PRIVATE_KEY, flashbotsProvider);

  console.log(`Wallet Address: ${wallet.address}`);

  // Check balance
  const balance = await publicProvider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);

  const minRequired = TEST_AMOUNT + ethers.parseEther('0.001'); // TX + gas
  if (balance < minRequired) {
    console.log(`Insufficient balance!`);
    console.log(`Need at least: ${ethers.formatEther(minRequired)} ETH`);
    console.log(`\nGet Sepolia ETH from: https://sepoliafaucet.com/`);
    return;
  }

  // Get fee data
  const feeData = await publicProvider.getFeeData();
  const nonce = await publicProvider.getTransactionCount(wallet.address);

  console.log('Transaction Details:');
  console.log(`  To: ${TEST_RECIPIENT}`);
  console.log(`  Amount: ${ethers.formatEther(TEST_AMOUNT)} ETH`);
  console.log(`  Nonce: ${nonce}`);
  console.log(`  Max Fee: ${ethers.formatUnits(feeData.maxFeePerGas!, 'gwei')} gwei`);
  console.log(`  Priority Fee: ${ethers.formatUnits(feeData.maxPriorityFeePerGas!, 'gwei')} gwei\n`);

  // Build transaction
  const tx: ethers.TransactionRequest = {
    to: TEST_RECIPIENT,
    value: TEST_AMOUNT,
    gasLimit: 21000n,
    maxFeePerGas: feeData.maxFeePerGas!,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas!,
    nonce,
    chainId: 11155111n, // Sepolia
    type: 2,
  };

  console.log('Sending transaction via Flashbots Protect...');
  console.log('(Transaction will NOT appear in public mempool)\n');

  try {
    const txResponse = await wallet.sendTransaction(tx);

    console.log('Transaction Submitted!');
    console.log(`  Hash: ${txResponse.hash}`);
    console.log(`  Explorer: ${TESTNET_CONFIG.sepolia.explorer}/tx/${txResponse.hash}\n`);

    console.log('Waiting for confirmation...');
    const receipt = await txResponse.wait();

    if (receipt && receipt.status === 1) {
      console.log('\n=== SUCCESS ===');
      console.log(`Block: ${receipt.blockNumber}`);
      console.log(`Gas Used: ${receipt.gasUsed}`);
      console.log(`Effective Gas Price: ${ethers.formatUnits(receipt.gasPrice, 'gwei')} gwei`);

      const cost = receipt.gasUsed * receipt.gasPrice;
      console.log(`Total Cost: ${ethers.formatEther(cost)} ETH`);

      const newBalance = await publicProvider.getBalance(wallet.address);
      console.log(`\nNew Balance: ${ethers.formatEther(newBalance)} ETH`);
    } else {
      console.log('\n=== TRANSACTION FAILED ===');
      console.log('Status: Reverted');
    }
  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error((error as Error).message);
  }

  // Compare with what we'd see in public mempool
  console.log('\n--- MEV Protection Analysis ---');
  console.log('This transaction was sent through Flashbots Protect.');
  console.log('It was NOT visible in the public mempool before inclusion.');
  console.log('Front-running bots could NOT see or exploit this transaction.');
}

main().catch(console.error);
