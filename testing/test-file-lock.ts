/**
 * Test File Locking Mechanism
 *
 * Run with: npx tsx testing/test-file-lock.ts
 */

import { acquireLock, releaseLock, atomicWrite, modifyFileWithLock, cleanupStaleLocks } from '../orchestration/fileLock';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const TEST_FILE = join(process.cwd(), 'testing', '.test-lock-file.txt');

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testBasicLocking(): Promise<boolean> {
  console.log('\n=== Test 1: Basic Lock/Unlock ===');

  try {
    const lock = await acquireLock(TEST_FILE, 'test-instance-1');
    console.log('  Lock acquired successfully');

    // Write something while holding lock
    atomicWrite(TEST_FILE, 'Test content from instance 1');
    console.log('  Wrote content atomically');

    await releaseLock(lock);
    console.log('  Lock released');

    // Verify content
    const content = readFileSync(TEST_FILE, 'utf-8');
    if (content === 'Test content from instance 1') {
      console.log('  [PASS] Content verified');
      return true;
    } else {
      console.log('  [FAIL] Content mismatch');
      return false;
    }
  } catch (error) {
    console.error('  [FAIL]', (error as Error).message);
    return false;
  }
}

async function testConcurrentLocking(): Promise<boolean> {
  console.log('\n=== Test 2: Concurrent Lock Attempts ===');

  try {
    // Acquire first lock
    const lock1 = await acquireLock(TEST_FILE, 'instance-A');
    console.log('  Instance A acquired lock');

    // Try to acquire second lock (should wait or timeout)
    let lock2Acquired = false;
    const lock2Promise = acquireLock(TEST_FILE, 'instance-B')
      .then((lock) => {
        lock2Acquired = true;
        return lock;
      })
      .catch(() => null);

    // Wait a bit to see if lock2 is blocked
    await sleep(500);

    if (lock2Acquired) {
      console.log('  [FAIL] Instance B acquired lock while A holds it');
      return false;
    }
    console.log('  Instance B is correctly waiting for lock');

    // Release first lock
    await releaseLock(lock1);
    console.log('  Instance A released lock');

    // Now lock2 should acquire
    const lock2 = await lock2Promise;
    if (lock2) {
      console.log('  Instance B acquired lock after A released');
      await releaseLock(lock2);
      console.log('  [PASS] Concurrent locking works correctly');
      return true;
    } else {
      console.log('  [FAIL] Instance B failed to acquire lock');
      return false;
    }
  } catch (error) {
    console.error('  [FAIL]', (error as Error).message);
    return false;
  }
}

async function testAtomicWrite(): Promise<boolean> {
  console.log('\n=== Test 3: Atomic Write ===');

  try {
    const testContent = 'Line 1\nLine 2\nLine 3\n' + 'x'.repeat(10000);

    atomicWrite(TEST_FILE, testContent);

    const readContent = readFileSync(TEST_FILE, 'utf-8');
    if (readContent === testContent) {
      console.log('  [PASS] Atomic write preserved content integrity');
      return true;
    } else {
      console.log('  [FAIL] Content mismatch after atomic write');
      return false;
    }
  } catch (error) {
    console.error('  [FAIL]', (error as Error).message);
    return false;
  }
}

async function testModifyWithLock(): Promise<boolean> {
  console.log('\n=== Test 4: Modify With Lock ===');

  try {
    // Initialize file
    atomicWrite(TEST_FILE, 'Initial content');

    // Modify with lock
    await modifyFileWithLock(
      TEST_FILE,
      (content) => content + '\nAppended line 1',
      'modifier-1'
    );

    await modifyFileWithLock(
      TEST_FILE,
      (content) => content + '\nAppended line 2',
      'modifier-2'
    );

    const finalContent = readFileSync(TEST_FILE, 'utf-8');
    const expected = 'Initial content\nAppended line 1\nAppended line 2';

    if (finalContent === expected) {
      console.log('  [PASS] Sequential modifications preserved correctly');
      return true;
    } else {
      console.log('  [FAIL] Content mismatch');
      console.log('  Expected:', expected);
      console.log('  Got:', finalContent);
      return false;
    }
  } catch (error) {
    console.error('  [FAIL]', (error as Error).message);
    return false;
  }
}

async function testStaleLockCleanup(): Promise<boolean> {
  console.log('\n=== Test 5: Stale Lock Cleanup ===');

  try {
    const cleaned = cleanupStaleLocks();
    console.log(`  Cleaned up ${cleaned} stale locks`);
    console.log('  [PASS] Cleanup completed without errors');
    return true;
  } catch (error) {
    console.error('  [FAIL]', (error as Error).message);
    return false;
  }
}

async function main(): Promise<void> {
  console.log('========================================');
  console.log('File Locking Mechanism Tests');
  console.log('========================================');

  // Cleanup first
  cleanupStaleLocks();

  const results: boolean[] = [];

  results.push(await testBasicLocking());
  results.push(await testConcurrentLocking());
  results.push(await testAtomicWrite());
  results.push(await testModifyWithLock());
  results.push(await testStaleLockCleanup());

  // Cleanup test file
  try {
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }
  } catch {
    // Ignore
  }

  console.log('\n========================================');
  console.log('Test Summary');
  console.log('========================================');

  const passed = results.filter((r) => r).length;
  const failed = results.filter((r) => !r).length;

  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed === 0) {
    console.log('\nAll tests passed! File locking is working correctly.');
    process.exit(0);
  } else {
    console.log('\nSome tests failed. Review output above.');
    process.exit(1);
  }
}

main().catch(console.error);
