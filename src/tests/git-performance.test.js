import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { GitToolHandlers } from '../mcp-server/handlers/git-tool-handlers.js';
import DatabaseManager from '../database/database-manager.js';
import GitSchema from '../database/git-schema.js';
import pathValidator from '../utils/path-validator.js';

describe('Git Performance Testing and Load Benchmarks', () => {
  let tempDir;
  let tempDbPath;
  let dbManager;
  let gitSchema;
  let gitToolHandlers;
  let smallRepoPath;
  let mediumRepoPath;
  let largeRepoPath;
  let monorepoPath;
  let originalValidate;

  beforeAll(async () => {
    console.log('⚡ Setting up Git Performance test environment...');
    
    tempDir = join(tmpdir(), `performance-test-${Date.now()}`);
    tempDbPath = join(tmpdir(), `performance-${Date.now()}.db`);
    smallRepoPath = join(tempDir, 'small-repo');
    mediumRepoPath = join(tempDir, 'medium-repo');
    largeRepoPath = join(tempDir, 'large-repo');
    monorepoPath = join(tempDir, 'monorepo');
    
    await fs.mkdir(smallRepoPath, { recursive: true });
    await fs.mkdir(mediumRepoPath, { recursive: true });
    await fs.mkdir(largeRepoPath, { recursive: true });
    await fs.mkdir(monorepoPath, { recursive: true });
    
    // Create small repository (5 commits)
    console.log('📁 Creating small repository (5 commits)...');
    await createRepository(smallRepoPath, 5, 'small');
    
    // Create medium repository (50 commits)
    console.log('📁 Creating medium repository (50 commits)...');
    await createRepository(mediumRepoPath, 50, 'medium');
    
    // Create large repository (200 commits)
    console.log('📁 Creating large repository (200 commits)...');
    await createRepository(largeRepoPath, 200, 'large');
    
    // Create monorepo with multiple subdirectories
    console.log('📁 Creating monorepo with multiple subdirectories...');
    await createMonorepo(monorepoPath);
    
    // Initialize database components
    dbManager = new DatabaseManager(tempDbPath);
    await dbManager.initialize();
    gitSchema = new GitSchema(dbManager.db);
    await gitSchema.initialize();
    
    gitToolHandlers = new GitToolHandlers(dbManager, gitSchema);
    
    // Mock path validator to allow test paths
    originalValidate = pathValidator.validateProjectPath;
    pathValidator.validateProjectPath = (path) => {
      if (path && path.includes('performance-test')) {
        return { isValid: true, sanitizedPath: path };
      }
      return originalValidate(path);
    };
    
    console.log('✅ Git Performance test environment ready');
  }, 120000); // 2 minute timeout for setup

  afterAll(async () => {
    console.log('🧹 Cleaning up Git Performance test environment...');
    
    // Restore original path validator
    if (originalValidate) {
      pathValidator.validateProjectPath = originalValidate;
    }
    
    // Close database
    if (dbManager) {
      dbManager.close();
    }
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.unlink(tempDbPath);
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
    
    console.log('✅ Git Performance cleanup complete');
  });

  beforeEach(() => {
    // Clear performance-related data before each test
    const clearStmt = dbManager.db.prepare('DELETE FROM restore_points');
    clearStmt.run();
  });

  // Helper function to parse MCP response format
  const parseMCPResponse = (response) => {
    if (!response || !response.content || !response.content[0]) {
      console.log('🔍 DEBUG: Invalid response structure:', response);
      return null;
    }
    try {
      // MCP responses have format: {content: [{type: 'text', text: JSON}]}
      const text = response.content[0].text;
      // Handle error responses that start with "Error: "
      if (text.startsWith('Error: ')) {
        return { error: text.substring(7), success: false };
      }
      return JSON.parse(text);
    } catch (err) {
      console.log('🔍 DEBUG: Failed to parse MCP response:', response, err);
      return { error: 'Failed to parse response', success: false };
    }
  };

  // Helper function to create repository with specified number of commits
  async function createRepository(repoPath, commitCount, prefix) {
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@example.com"', { cwd: repoPath });
    execSync('git config user.name "Test User"', { cwd: repoPath });
    
    for (let i = 1; i <= commitCount; i++) {
      const fileName = `${prefix}-file-${i}.txt`;
      const content = `This is ${prefix} file ${i}\n${'Line '.repeat(10)}${i}\n`;
      
      await fs.writeFile(join(repoPath, fileName), content);
      execSync('git add .', { cwd: repoPath });
      execSync(`git commit -m "${prefix} commit ${i}: Add ${fileName}"`, { cwd: repoPath });
      
      // Add some files to simulate real development
      if (i % 10 === 0) {
        await fs.writeFile(join(repoPath, `${prefix}-config-${i}.json`), 
          JSON.stringify({ version: i, env: prefix }, null, 2));
        execSync('git add .', { cwd: repoPath });
        execSync(`git commit -m "${prefix} config ${i}: Update configuration"`, { cwd: repoPath });
      }
    }
  }

  // Helper function to create monorepo with subdirectories
  async function createMonorepo(repoPath) {
    const subdirs = ['frontend', 'backend', 'shared', 'docs', 'tools'];
    
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@example.com"', { cwd: repoPath });
    execSync('git config user.name "Test User"', { cwd: repoPath });
    
    // Create subdirectories
    for (const subdir of subdirs) {
      await fs.mkdir(join(repoPath, subdir), { recursive: true });
    }
    
    // Create commits in each subdirectory
    for (let i = 1; i <= 30; i++) {
      const subdir = subdirs[i % subdirs.length];
      const fileName = `file-${i}.js`;
      const content = `// ${subdir} file ${i}\nfunction func${i}() { return ${i}; }\n`;
      
      await fs.writeFile(join(repoPath, subdir, fileName), content);
      execSync('git add .', { cwd: repoPath });
      execSync(`git commit -m "${subdir}: Add ${fileName}"`, { cwd: repoPath });
    }
  }

  // Helper function to measure execution time
  function measureTime() {
    const start = process.hrtime.bigint();
    return {
      end: () => {
        const end = process.hrtime.bigint();
        return Number(end - start) / 1000000; // Convert to milliseconds
      }
    };
  }

  describe('Repository Discovery Performance', () => {
    test('should discover small repository quickly', async () => {
      const timer = measureTime();
      
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: smallRepoPath
      });
      const result = parseMCPResponse(response);
      
      const elapsed = timer.end();
      
      expect(result?.error).toBeUndefined();
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
      console.log(`📊 Small repository discovery: ${elapsed.toFixed(2)}ms`);
    });

    test('should discover medium repository efficiently', async () => {
      const timer = measureTime();
      
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: mediumRepoPath
      });
      const result = parseMCPResponse(response);
      
      const elapsed = timer.end();
      
      expect(result?.error).toBeUndefined();
      expect(elapsed).toBeLessThan(3000); // Should complete in under 3 seconds
      console.log(`📊 Medium repository discovery: ${elapsed.toFixed(2)}ms`);
    });

    test('should handle large repository within reasonable time', async () => {
      const timer = measureTime();
      
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: largeRepoPath,
        limit: 50 // Limit commits for performance
      });
      const result = parseMCPResponse(response);
      
      const elapsed = timer.end();
      
      expect(result?.error).toBeUndefined();
      expect(elapsed).toBeLessThan(10000); // Should complete in under 10 seconds
      console.log(`📊 Large repository discovery: ${elapsed.toFixed(2)}ms`);
      
      if (result?.commit_history) {
        expect(result.commit_history.length).toBeLessThanOrEqual(50);
      }
    });

    test('should discover monorepo subdirectories efficiently', async () => {
      const subdirs = ['frontend', 'backend', 'shared'];
      
      for (const subdir of subdirs) {
        const timer = measureTime();
        
        const response = await gitToolHandlers.handleGetGitContext({
          project_path: join(monorepoPath, subdir),
          subdirectory: subdir
        });
        const result = parseMCPResponse(response);
        
        const elapsed = timer.end();
        
        expect(result?.error).toBeUndefined();
        expect(elapsed).toBeLessThan(2000); // Should complete in under 2 seconds
        console.log(`📊 Monorepo ${subdir} discovery: ${elapsed.toFixed(2)}ms`);
      }
    });
  });

  describe('Commit History Retrieval Performance', () => {
    test('should retrieve small commit history quickly', async () => {
      const timer = measureTime();
      
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: smallRepoPath,
        limit: 10
      });
      const result = parseMCPResponse(response);
      
      const elapsed = timer.end();
      
      expect(result?.error).toBeUndefined();
      expect(elapsed).toBeLessThan(500); // Should complete in under 0.5 seconds
      console.log(`📊 Small commit history (10): ${elapsed.toFixed(2)}ms`);
    });

    test('should handle medium commit history retrieval', async () => {
      const timer = measureTime();
      
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: mediumRepoPath,
        limit: 25
      });
      const result = parseMCPResponse(response);
      
      const elapsed = timer.end();
      
      expect(result?.error).toBeUndefined();
      expect(elapsed).toBeLessThan(2000); // Should complete in under 2 seconds
      console.log(`📊 Medium commit history (25): ${elapsed.toFixed(2)}ms`);
    });

    test('should handle large commit history requests efficiently', async () => {
      const limits = [10, 25, 50, 100];
      
      for (const limit of limits) {
        const timer = measureTime();
        
        const response = await gitToolHandlers.handleGetGitContext({
          project_path: largeRepoPath,
          limit: limit
        });
        const result = parseMCPResponse(response);
        
        const elapsed = timer.end();
        
        expect(result?.error).toBeUndefined();
        expect(elapsed).toBeLessThan(limit * 100); // Linear scaling expectation
        console.log(`📊 Large commit history (${limit}): ${elapsed.toFixed(2)}ms`);
        
        if (result?.commit_history) {
          expect(result.commit_history.length).toBeLessThanOrEqual(limit);
        }
      }
    });

    test('should optimize filtered commit history retrieval', async () => {
      // Test subdirectory filtering performance
      const timer = measureTime();
      
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: monorepoPath,
        subdirectory: 'frontend',
        limit: 20
      });
      const result = parseMCPResponse(response);
      
      const elapsed = timer.end();
      
      expect(result?.error).toBeUndefined();
      expect(elapsed).toBeLessThan(3000); // Filtered queries should still be fast
      console.log(`📊 Filtered commit history (frontend): ${elapsed.toFixed(2)}ms`);
    });
  });

  describe('Database Operations Performance', () => {
    test('should insert repository data efficiently', async () => {
      const repositories = [smallRepoPath, mediumRepoPath, largeRepoPath];
      
      for (const repoPath of repositories) {
        const timer = measureTime();
        
        // Ensure repository is indexed in database
        const response = await gitToolHandlers.handleGetGitContext({
          project_path: repoPath,
          limit: 5
        });
        const result = parseMCPResponse(response);
        
        const elapsed = timer.end();
        
        expect(elapsed).toBeLessThan(5000); // Database operations should be fast
        console.log(`📊 Database indexing ${repoPath.split('/').pop()}: ${elapsed.toFixed(2)}ms`);
      }
    });

    test('should handle concurrent database operations', async () => {
      const concurrentOps = [
        gitToolHandlers.handleCreateRestorePoint({
          project_path: smallRepoPath,
          label: 'perf-test-1',
          description: 'Performance test 1'
        }),
        gitToolHandlers.handleCreateRestorePoint({
          project_path: mediumRepoPath,
          label: 'perf-test-2',
          description: 'Performance test 2'
        }),
        gitToolHandlers.handleCreateRestorePoint({
          project_path: largeRepoPath,
          label: 'perf-test-3',
          description: 'Performance test 3'
        })
      ];
      
      const timer = measureTime();
      const results = await Promise.all(concurrentOps);
      const elapsed = timer.end();
      
      results.forEach(result => {
        expect(result.error).toBeUndefined();
      });
      
      expect(elapsed).toBeLessThan(10000); // Concurrent ops should complete quickly
      console.log(`📊 Concurrent database operations (3): ${elapsed.toFixed(2)}ms`);
    });

    test('should handle bulk restore point operations efficiently', async () => {
      const bulkOps = [];
      const opCount = 20;
      
      for (let i = 1; i <= opCount; i++) {
        bulkOps.push(
          gitToolHandlers.handleCreateRestorePoint({
            project_path: smallRepoPath,
            label: `bulk-test-${i}`,
            description: `Bulk performance test ${i}`
          })
        );
      }
      
      const timer = measureTime();
      const results = await Promise.all(bulkOps);
      const elapsed = timer.end();
      
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBeGreaterThan(opCount * 0.8); // At least 80% success rate
      
      const avgTime = elapsed / opCount;
      expect(avgTime).toBeLessThan(500); // Average under 500ms per operation
      console.log(`📊 Bulk operations (${opCount}): ${elapsed.toFixed(2)}ms total, ${avgTime.toFixed(2)}ms avg`);
    });
  });

  describe('Memory Usage and Resource Management', () => {
    test('should maintain reasonable memory usage with large repositories', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform multiple operations on large repository
      for (let i = 0; i < 10; i++) {
        await gitToolHandlers.handleGetGitContext({
          project_path: largeRepoPath,
          limit: 50
        });
      }
      
      const finalMemory = process.memoryUsage();
      const heapIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
      
      expect(heapIncrease).toBeLessThan(100); // Memory increase should be under 100MB
      console.log(`📊 Memory increase after 10 large operations: ${heapIncrease.toFixed(2)}MB`);
    });

    test('should handle repository caching efficiently', async () => {
      // First call (cache miss)
      const timer1 = measureTime();
      const result1 = await gitToolHandlers.handleGetGitContext({
        project_path: mediumRepoPath,
        limit: 20
      });
      const elapsed1 = timer1.end();
      
      // Second call (cache hit)
      const timer2 = measureTime();
      const result2 = await gitToolHandlers.handleGetGitContext({
        project_path: mediumRepoPath,
        limit: 20
      });
      const elapsed2 = timer2.end();
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      // Cache hit should be faster (or at least not significantly slower)
      expect(elapsed2).toBeLessThanOrEqual(elapsed1 * 1.5); // Allow 50% variance
      console.log(`📊 Cache miss: ${elapsed1.toFixed(2)}ms, Cache hit: ${elapsed2.toFixed(2)}ms`);
    });

    test('should handle multiple concurrent repository operations', async () => {
      const repositories = [smallRepoPath, mediumRepoPath, largeRepoPath, monorepoPath];
      const concurrentOps = repositories.map(repoPath => 
        gitToolHandlers.handleGetGitContext({
          project_path: repoPath,
          limit: 15
        })
      );
      
      const timer = measureTime();
      const results = await Promise.all(concurrentOps);
      const elapsed = timer.end();
      
      results.forEach(result => {
        expect(result.error).toBeUndefined();
      });
      
      expect(elapsed).toBeLessThan(15000); // All operations should complete in under 15 seconds
      console.log(`📊 Concurrent repository operations (4): ${elapsed.toFixed(2)}ms`);
    });
  });

  describe('Scalability and Load Testing', () => {
    test('should handle high-frequency requests', async () => {
      const requestCount = 50;
      const operations = [];
      
      for (let i = 0; i < requestCount; i++) {
        operations.push(
          gitToolHandlers.handleListRestorePoints({
            project_path: smallRepoPath,
            limit: 10
          })
        );
      }
      
      const timer = measureTime();
      const results = await Promise.all(operations);
      const elapsed = timer.end();
      
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBeGreaterThan(requestCount * 0.9); // 90% success rate
      
      const avgTime = elapsed / requestCount;
      expect(avgTime).toBeLessThan(200); // Average under 200ms per request
      console.log(`📊 High-frequency requests (${requestCount}): ${avgTime.toFixed(2)}ms avg`);
    });

    test('should handle mixed operation types under load', async () => {
      const mixedOps = [];
      
      // Mix different types of operations
      for (let i = 0; i < 30; i++) {
        if (i % 3 === 0) {
          mixedOps.push(gitToolHandlers.handleGetGitContext({
            project_path: smallRepoPath,
            limit: 10
          }));
        } else if (i % 3 === 1) {
          mixedOps.push(gitToolHandlers.handleCreateRestorePoint({
            project_path: smallRepoPath,
            label: `load-test-${i}`,
            description: `Load test ${i}`
          }));
        } else {
          mixedOps.push(gitToolHandlers.handleListRestorePoints({
            project_path: smallRepoPath,
            limit: 5
          }));
        }
      }
      
      const timer = measureTime();
      const results = await Promise.all(mixedOps);
      const elapsed = timer.end();
      
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBeGreaterThan(mixedOps.length * 0.8); // 80% success rate under load
      
      console.log(`📊 Mixed load test (30 ops): ${elapsed.toFixed(2)}ms total, ${successCount}/${mixedOps.length} successful`);
    });

    test('should maintain performance with growing database', async () => {
      // Create many restore points to simulate growing database
      const setupOps = [];
      for (let i = 0; i < 100; i++) {
        setupOps.push(gitToolHandlers.handleCreateRestorePoint({
          project_path: smallRepoPath,
          label: `growth-test-${i}`,
          description: `Database growth test ${i}`
        }));
      }
      
      await Promise.all(setupOps);
      
      // Test performance with large database
      const timer = measureTime();
      const result = await gitToolHandlers.handleListRestorePoints({
        project_path: smallRepoPath,
        limit: 50
      });
      const elapsed = timer.end();
      
      expect(result.error).toBeUndefined();
      expect(elapsed).toBeLessThan(3000); // Should still be fast with large database
      console.log(`📊 Large database query: ${elapsed.toFixed(2)}ms`);
      
      if (Array.isArray(result)) {
        expect(result.length).toBeLessThanOrEqual(50);
      }
    });
  });

  describe('Performance Regression Testing', () => {
    test('should maintain consistent performance across multiple runs', async () => {
      const runCount = 5;
      const times = [];
      
      for (let i = 0; i < runCount; i++) {
        const timer = measureTime();
        
        const result = await gitToolHandlers.handleGetGitContext({
          project_path: mediumRepoPath,
          limit: 20
        });
        
        const elapsed = timer.end();
        times.push(elapsed);
        
        expect(result.error).toBeUndefined();
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);
      const variance = maxTime - minTime;
      
      expect(variance).toBeLessThan(avgTime * 2); // Variance should be reasonable
      console.log(`📊 Consistency test (${runCount} runs): avg=${avgTime.toFixed(2)}ms, variance=${variance.toFixed(2)}ms`);
    });

    test('should handle performance baseline comparisons', async () => {
      const baseline = {
        smallRepo: 1000, // 1 second
        mediumRepo: 3000, // 3 seconds
        largeRepo: 10000, // 10 seconds
        concurrentOps: 5000 // 5 seconds for 3 concurrent ops
      };
      
      // Test small repository
      const timer1 = measureTime();
      const result1 = await gitToolHandlers.handleGetGitContext({
        project_path: smallRepoPath,
        limit: 10
      });
      const elapsed1 = timer1.end();
      
      expect(result1.success).toBe(true);
      expect(elapsed1).toBeLessThan(baseline.smallRepo);
      
      // Test medium repository
      const timer2 = measureTime();
      const result2 = await gitToolHandlers.handleGetGitContext({
        project_path: mediumRepoPath,
        limit: 25
      });
      const elapsed2 = timer2.end();
      
      expect(result2.success).toBe(true);
      expect(elapsed2).toBeLessThan(baseline.mediumRepo);
      
      console.log(`📊 Baseline comparison - Small: ${elapsed1.toFixed(2)}ms (< ${baseline.smallRepo}ms), Medium: ${elapsed2.toFixed(2)}ms (< ${baseline.mediumRepo}ms)`);
    });
  });
});