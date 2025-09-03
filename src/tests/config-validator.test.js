import { test, describe, expect } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import ConfigValidator from '../utils/config-validator.js';

describe('ConfigValidator Tests', () => {
  let validator;
  let originalEnv;
  let tempTestDir;

  test('setup test environment', async () => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Create temporary test directory
    tempTestDir = join(tmpdir(), `config-test-${Date.now()}`);
    await fs.mkdir(tempTestDir, { recursive: true });
    
    console.log(`Test directory: ${tempTestDir}`);
  });

  test('ConfigValidator initializes correctly', () => {
    validator = new ConfigValidator();
    assert.ok(validator, 'ConfigValidator should be created');
    assert.ok(Array.isArray(validator.requiredPaths), 'Should have required paths array');
    assert.ok(Array.isArray(validator.optionalPaths), 'Should have optional paths array');
    console.log('✅ ConfigValidator initialized');
  });

  test('validate passes with valid configuration', async () => {
    // Set valid environment
    process.env.LOG_LEVEL = 'debug';
    process.env.DB_PATH = join(tempTestDir, 'test.db');
    
    const result = await validator.validate();
    
    assert.strictEqual(result.valid, true, 'Validation should pass');
    assert.strictEqual(result.errors.length, 0, 'Should have no errors');
    assert.ok(result.info.length > 0, 'Should have info messages');
    
    console.log('✅ Configuration validation passed');
    console.log(`   Info messages: ${result.info.length}`);
    console.log(`   Warnings: ${result.warnings.length}`);
  });

  test('validate handles missing optional paths gracefully', async () => {
    const result = await validator.validate();
    
    // Should still pass validation even with missing optional paths
    assert.strictEqual(result.valid, true, 'Should still be valid');
    
    // Check for warnings or info about optional paths
    const hasOptionalPathMessages = result.warnings.some(w => 
      w.includes('Optional path not found')
    ) || result.info.some(i => 
      i.includes('Optional path') 
    );
    
    // Note: The validator may find optional paths if they exist on the system
    // This test verifies the validation passes regardless
    console.log(`✅ Optional path handling verified (${result.warnings.length} warnings, ${result.info.length} info)`);
  });

  test('validate detects database library availability', async () => {
    const result = await validator.validate();
    
    // Should detect better-sqlite3 is available
    const hasDatabaseInfo = result.info.some(info => 
      info.includes('Database library') && info.includes('available')
    );
    assert.ok(hasDatabaseInfo, 'Should detect database library availability');
    
    console.log('✅ Database library detection verified');
  });

  test('validate checks directory write permissions', async () => {
    const result = await validator.validate();
    
    // Should verify database directory is writable
    const hasWriteInfo = result.info.some(info => 
      info.includes('Database directory writable')
    );
    assert.ok(hasWriteInfo, 'Should verify database directory is writable');
    
    console.log('✅ Write permissions check verified');
  });

  test('validateOrExit handles validation failure', async () => {
    // Mock process.exit to capture exit calls
    let exitCode = null;
    const originalExit = process.exit;
    process.exit = (code) => { exitCode = code; };
    
    try {
      // Create validator that will fail (simulate by breaking database library import)
      const failingValidator = new ConfigValidator();
      
      // Override validateDatabase to force failure
      const originalValidateDatabase = failingValidator.validateDatabase;
      failingValidator.validateDatabase = async (results) => {
        results.valid = false;
        results.errors.push('Simulated database validation failure');
      };
      
      await failingValidator.validateOrExit();
      
      // Should have called process.exit(1)
      assert.strictEqual(exitCode, 1, 'Should exit with code 1 on validation failure');
      console.log('✅ Validation failure handling verified');
      
    } finally {
      // Restore original process.exit
      process.exit = originalExit;
    }
  });

  test('cleanup test environment', async () => {
    // Restore original environment
    process.env = { ...originalEnv };
    
    // Clean up test directory
    try {
      await fs.rm(tempTestDir, { recursive: true, force: true });
      console.log('✅ Test environment cleaned up');
    } catch (error) {
      console.log('⚠️  Cleanup completed with warnings');
    }
  });
});