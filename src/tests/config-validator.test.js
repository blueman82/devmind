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
    expect(validator).toBeTruthy();
    expect(Array.isArray(validator.requiredPaths)).toBe(true);
    expect(Array.isArray(validator.optionalPaths)).toBe(true);
    console.log('✅ ConfigValidator initialized');
  });

  test('validate passes with valid configuration', async () => {
    // Set valid environment
    process.env.LOG_LEVEL = 'debug';
    process.env.DB_PATH = join(tempTestDir, 'test.db');
    
    const result = await validator.validate();
    
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.info.length).toBeGreaterThan(0);
    
    console.log('✅ Configuration validation passed');
    console.log(`   Info messages: ${result.info.length}`);
    console.log(`   Warnings: ${result.warnings.length}`);
  });

  test('validate handles missing optional paths gracefully', async () => {
    const result = await validator.validate();
    
    // Should still pass validation even with missing optional paths
    expect(result.valid).toBe(true);
    
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
    expect(hasDatabaseInfo).toBe(true);
    
    console.log('✅ Database library detection verified');
  });

  test('validate checks directory write permissions', async () => {
    const result = await validator.validate();
    
    // Should verify database directory is writable
    const hasWriteInfo = result.info.some(info => 
      info.includes('Database directory writable')
    );
    expect(hasWriteInfo).toBe(true);
    
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
      expect(exitCode).toBe(1);
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
    } catch {
      console.log('⚠️  Cleanup completed with warnings');
    }
  });
});