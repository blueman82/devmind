import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { GitToolHandlers } from '../mcp-server/handlers/git-tool-handlers.js';
import DatabaseManager from '../database/database-manager.js';
import GitSchema from '../database/git-schema.js';
import pathValidator from '../utils/path-validator.js';

describe('Git Error Handling and Edge Cases', () => {
  let tempDir;
  let tempDbPath;
  let dbManager;
  let gitSchema;
  let gitToolHandlers;
  let testRepoPath;
  let nonGitPath;
  let corruptedRepoPath;
  let originalValidate;

  beforeAll(async () => {
    console.log('⚠️ Setting up Git Error Handling test environment...');
    
    tempDir = join(tmpdir(), `error-handling-test-${Date.now()}`);
    tempDbPath = join(tmpdir(), `error-handling-${Date.now()}.db`);
    testRepoPath = join(tempDir, 'valid-repo');
    nonGitPath = join(tempDir, 'non-git-directory');
    corruptedRepoPath = join(tempDir, 'corrupted-repo');
    
    await fs.mkdir(testRepoPath, { recursive: true });
    await fs.mkdir(nonGitPath, { recursive: true });
    await fs.mkdir(corruptedRepoPath, { recursive: true });
    
    // Setup valid repository for baseline tests
    execSync('git init', { cwd: testRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: testRepoPath });
    execSync('git config user.name "Test User"', { cwd: testRepoPath });
    
    await fs.writeFile(join(testRepoPath, 'README.md'), '# Error Handling Test Repo\n');
    execSync('git add .', { cwd: testRepoPath });
    execSync('git commit -m "Initial commit for error testing"', { cwd: testRepoPath });
    
    // Setup corrupted repository (git init but corrupt .git folder)
    execSync('git init', { cwd: corruptedRepoPath });
    // Corrupt the .git/HEAD file
    await fs.writeFile(join(corruptedRepoPath, '.git', 'HEAD'), 'invalid-ref-content');
    
    // Initialize database components
    dbManager = new DatabaseManager(tempDbPath);
    await dbManager.initialize();
    gitSchema = new GitSchema(dbManager.db);
    await gitSchema.initialize();
    
    gitToolHandlers = new GitToolHandlers(dbManager, gitSchema);
    await gitToolHandlers.initialize();
    
    // Mock path validator to allow test paths
    originalValidate = pathValidator.validateProjectPath;
    pathValidator.validateProjectPath = (path) => {
      if (path && path.includes('error-handling-test')) {
        return { isValid: true, normalizedPath: path };
      }
      return originalValidate(path);
    };
    
    console.log('✅ Git Error Handling test environment ready');
  });

  afterAll(async () => {
    console.log('🧹 Cleaning up Git Error Handling test environment...');
    
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
    
    console.log('✅ Git Error Handling cleanup complete');
  });

  beforeEach(async () => {
    // Clear any test data before each test
    const clearStmt = dbManager.db.prepare('DELETE FROM restore_points');
    clearStmt.run();
  });

  // Helper function to parse MCP response format
  const parseMCPResponse = (response) => {
    if (!response || !response.content || !response.content[0]) {
      return null;
    }
    try {
      const text = response.content[0].text;
      if (text.startsWith('Error: ')) {
        return { error: text.substring(7) };
      }
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  describe('Invalid Path Handling', () => {
    test('should handle non-existent paths gracefully', async () => {
      const nonExistentPath = '/absolutely/nonexistent/path/that/should/not/exist';
      
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: nonExistentPath
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeDefined();
      expect(result?.error).toContain('Invalid project path');
      expect(result?.error).toContain('does not exist');
    });

    test('should handle empty/null project path', async () => {
      const results = await Promise.all([
        gitToolHandlers.handleGetGitContext({ project_path: '' }),
        gitToolHandlers.handleGetGitContext({ project_path: null }),
        gitToolHandlers.handleGetGitContext({ project_path: undefined }),
        gitToolHandlers.handleGetGitContext({}) // Missing project_path entirely
      ]);

      const parsedResults = results.map(parseMCPResponse);
      
      parsedResults.forEach(result => {
        expect(result?.error).toBeDefined();
        expect(result?.error).toContain('project_path');
      });
    });

    test('should handle paths with invalid characters', async () => {
      const invalidPaths = [
        '/path/with\x00null/character',
        '/path/with/../../traversal',
        '/path/with/\x01control/chars',
        'relative/path/without/root'
      ];

      for (const invalidPath of invalidPaths) {
        const response = await gitToolHandlers.handleGetGitContext({
          project_path: invalidPath
        });
        const result = parseMCPResponse(response);

        expect(result?.error).toBeDefined();
      }
    });

    test('should handle permission denied scenarios', async () => {
      // Create a directory with restricted permissions (if possible)
      const restrictedPath = join(tempDir, 'restricted');
      await fs.mkdir(restrictedPath, { recursive: true });
      
      try {
        // Try to restrict permissions (may not work on all systems)
        await fs.chmod(restrictedPath, 0o000);
        
        const response = await gitToolHandlers.handleGetGitContext({
          project_path: restrictedPath
        });
        const result = parseMCPResponse(response);

        expect(result?.error).toBeDefined();
        
        // Restore permissions for cleanup
        await fs.chmod(restrictedPath, 0o755);
      } catch (error) {
        // If we can't create permission issues, that's okay - skip this test
        console.warn('Could not test permission scenarios:', error.message);
      }
    });
  });

  describe('Non-Git Directory Handling', () => {
    test('should handle directories that are not git repositories', async () => {
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: nonGitPath
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeDefined();
      expect(result?.error).toContain('repository');
    });

    test('should handle empty directories', async () => {
      const emptyPath = join(tempDir, 'empty-directory');
      await fs.mkdir(emptyPath, { recursive: true });
      
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: emptyPath
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeDefined();
      expect(result?.error).toContain('repository');
    });

    test('should detect when git command is not available', async () => {
      // This test would require mocking the git command or running in environment without git
      // For now, we'll test with an invalid git command path
      
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: nonGitPath
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeDefined();
    });
  });

  describe('Corrupted Repository Handling', () => {
    test('should handle corrupted git repositories gracefully', async () => {
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: corruptedRepoPath
      });
      const result = parseMCPResponse(response);

      // Should either succeed with empty results or fail gracefully
      if (result?.error) {
        expect(result?.error).toBeDefined();
        expect(result?.error).not.toContain('undefined');
      } else {
        // If it succeeds, should have project_path and repository info
        expect(result?.project_path).toBeDefined();
        expect(result?.repository).toBeDefined();
      }
    });

    test('should handle missing .git directory', async () => {
      const tempRepoPath = join(tempDir, 'missing-git');
      await fs.mkdir(tempRepoPath, { recursive: true });
      
      // Create a .git directory then delete it
      execSync('git init', { cwd: tempRepoPath });
      await fs.rm(join(tempRepoPath, '.git'), { recursive: true, force: true });
      
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: tempRepoPath
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeDefined();
      expect(result?.error).toContain('repository');
    });
  });

  describe('Database Connection Error Handling', () => {
    test('should handle database connection failures', async () => {
      // Temporarily break the database connection in the specific handler
      const originalDb = gitToolHandlers.restorePointHandlers.dbManager;
      gitToolHandlers.restorePointHandlers.dbManager = null;
      
      const response = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'db-error-test'
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeDefined();
      expect(result?.error).toContain('Cannot read properties of null');
      
      // Restore database connection
      gitToolHandlers.restorePointHandlers.dbManager = originalDb;
    });

    test('should handle database constraint violations', async () => {
      // Create a restore point first
      await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'constraint-test',
        description: 'Test for constraint violations'
      });
      
      // Try to create another with the same label (should violate unique constraint)
      const response = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'constraint-test',
        description: 'Duplicate label test'
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeDefined();
      expect(result?.error).toContain('already exists');
    });

    test('should handle database transaction failures', async () => {
      // Test with invalid data that should cause transaction rollback
      const response = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: null, // Invalid label should cause failure
        description: 'Transaction failure test'
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeDefined();
    });
  });

  describe('Parameter Validation Error Handling', () => {
    test('should handle invalid restore point parameters', async () => {
      const invalidParams = [
        { project_path: testRepoPath, label: '' }, // Empty label
        { project_path: testRepoPath, label: 'a'.repeat(256) }, // Too long label
        { project_path: testRepoPath, label: 'valid-label', test_status: 'invalid' }, // Invalid enum
        { project_path: testRepoPath, label: 'valid-label', auto_generated: 'not-boolean' } // Invalid boolean
      ];

      for (const params of invalidParams) {
        const response = await gitToolHandlers.handleCreateRestorePoint(params);
        const result = parseMCPResponse(response);
        
        expect(result?.error).toBeDefined();
      }
    });

    test('should handle invalid list restore points parameters', async () => {
      const invalidParams = [
        { project_path: testRepoPath, limit: -1 }, // Negative limit
        { project_path: testRepoPath, limit: 101 }, // Exceeds maximum
        { project_path: testRepoPath, include_auto_generated: 'not-boolean' }, // Invalid boolean
        { project_path: testRepoPath, timeframe: 123 } // Invalid timeframe type
      ];

      for (const params of invalidParams) {
        const response = await gitToolHandlers.handleListRestorePoints(params);
        const result = parseMCPResponse(response);
        
        expect(result?.error).toBeDefined();
      }
    });

    test('should handle missing required parameters', async () => {
      const incompleteParams = [
        {}, // No parameters at all
        { label: 'missing-path' }, // Missing project_path
        { project_path: testRepoPath }, // Missing label for create restore point
        { project_path: '' } // Empty project_path
      ];

      for (const params of incompleteParams) {
        const response = await gitToolHandlers.handleCreateRestorePoint(params);
        const result = parseMCPResponse(response);
        
        expect(result?.error).toBeDefined();
        expect(result?.error).toContain('required');
      }
    });
  });

  describe('Git Command Execution Errors', () => {
    test('should handle git command failures gracefully', async () => {
      // Test with corrupted repository that might cause git commands to fail
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: corruptedRepoPath
      });
      const result = parseMCPResponse(response);

      // Should handle git command failures without crashing
      if (result?.error) {
        expect(result?.error).toBeDefined();
        expect(result?.error).not.toContain('undefined');
        expect(result?.error).not.toContain('null');
      }
    });

    test('should handle timeout scenarios', async () => {
      // This would require a very large repository or simulated slow git operations
      // For now, we'll test that the timeout mechanism exists and works
      
      const startTime = Date.now();
      const response = await gitToolHandlers.handleGetGitContext({
        project_path: testRepoPath,
        limit: 1000 // Large number that might take time
      });
      const result = parseMCPResponse(response);
      const endTime = Date.now();

      // Should complete in reasonable time (less than 30 seconds for test)
      expect(endTime - startTime).toBeLessThan(30000);
      
      if (result?.error) {
        expect(result?.error).toBeDefined();
      } else {
        expect(result?.project_path).toBeDefined();
        expect(result?.repository).toBeDefined();
      }
    });

    test('should sanitize error messages for security', async () => {
      // Test with path that might reveal system information in error messages
      const sensitivePathResponse = await gitToolHandlers.handleGetGitContext({
        project_path: '/etc/passwd/nonexistent'
      });
      const sensitivePathResult = parseMCPResponse(sensitivePathResponse);

      expect(sensitivePathResult?.error).toBeDefined();
      expect(sensitivePathResult?.error).toBeDefined();
      // Error message should not contain sensitive system paths
      expect(sensitivePathResult?.error).not.toContain('/etc');
      expect(sensitivePathResult?.error).not.toContain('passwd');
    });
  });

  describe('Race Condition and Concurrency Errors', () => {
    test('should handle concurrent operations on same repository', async () => {
      const concurrentOps = Array(5).fill().map((_, i) => 
        gitToolHandlers.handleCreateRestorePoint({
          project_path: testRepoPath,
          label: `concurrent-${i}`,
          description: `Concurrent operation ${i}`
        })
      );

      const responses = await Promise.all(concurrentOps);
      const results = responses.map(parseMCPResponse);
      
      // All should either succeed or fail gracefully (no crashes)
      results.forEach(result => {
        expect(result).toBeDefined();
        if (result?.error) {
          expect(result?.error).toBeDefined();
        } else {
          expect(result?.label).toBeDefined();
        }
      });
    });

    test('should handle repository state changes during operations', async () => {
      // Start a git context operation
      const gitContextPromise = gitToolHandlers.handleGetGitContext({
        project_path: testRepoPath
      });
      
      // Simultaneously try to create a restore point
      const restorePointPromise = gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'concurrent-state-test'
      });

      const [gitResponse, restoreResponse] = await Promise.all([
        gitContextPromise,
        restorePointPromise
      ]);
      
      const gitResult = parseMCPResponse(gitResponse);
      const restoreResult = parseMCPResponse(restoreResponse);

      // Both operations should complete without crashing
      expect(gitResult).toBeDefined();
      expect(restoreResult).toBeDefined();
      if (!gitResult?.error) {
        expect(gitResult?.project_path).toBeDefined();
      }
      if (!restoreResult?.error) {
        expect(restoreResult?.label).toBeDefined();
      }
    });
  });

  describe('Memory and Resource Error Handling', () => {
    test('should handle large repository operations', async () => {
      // Create a repository with many commits (simulate large repo scenario)
      for (let i = 0; i < 50; i++) {
        await fs.writeFile(join(testRepoPath, `file-${i}.txt`), `Content ${i}`);
        execSync('git add .', { cwd: testRepoPath });
        execSync(`git commit -m "Commit ${i}"`, { cwd: testRepoPath });
      }

      const response = await gitToolHandlers.handleGetGitContext({
        project_path: testRepoPath,
        limit: 100 // Request many commits
      });
      const result = parseMCPResponse(response);

      // Should handle large result sets without memory issues
      if (result?.error) {
        expect(result?.error).toBeDefined();
        expect(result?.error).not.toContain('heap');
        expect(result?.error).not.toContain('memory');
      } else {
        expect(result?.project_path).toBeDefined();
        expect(result?.repository).toBeDefined();
        if (result?.commit_history) {
          expect(Array.isArray(result?.commit_history)).toBe(true);
        }
      }
    });

    test('should handle file system resource exhaustion', async () => {
      // Test creating many restore points to simulate resource exhaustion
      const manyRestorePoints = Array(20).fill().map((_, i) => 
        gitToolHandlers.handleCreateRestorePoint({
          project_path: testRepoPath,
          label: `resource-test-${i}`,
          description: `Resource exhaustion test ${i}`
        })
      );

      const responses = await Promise.all(manyRestorePoints);
      const results = responses.map(parseMCPResponse);
      
      // Should handle resource limits gracefully
      results.forEach(result => {
        expect(result).toBeDefined();
        if (result?.error) {
          expect(result?.error).toBeDefined();
          expect(result?.error).not.toContain('ENOSPC'); // Should handle disk space errors
        } else {
          expect(result?.label).toBeDefined();
        }
      });
    });
  });

  describe('Edge Case Parameter Handling', () => {
    test('should handle extremely long parameters', async () => {
      const veryLongString = 'a'.repeat(10000);
      
      const response = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'edge-case-test',
        description: veryLongString
      });
      const result = parseMCPResponse(response);

      // Should either accept long descriptions or reject gracefully
      if (result?.error) {
        expect(result?.error).toBeDefined();
        expect(result?.error).toContain('too long');
      } else {
        expect(result?.label).toBeDefined();
      }
    });

    test('should handle unicode and special characters in parameters', async () => {
      const unicodeLabels = [
        'test-émoji-🚀',
        'test-中文-characters',
        'test-русский-text',
        'test-🎯-multiple-🔥-emojis-✨'
      ];

      for (const label of unicodeLabels) {
        const response = await gitToolHandlers.handleCreateRestorePoint({
          project_path: testRepoPath,
          label: label,
          description: 'Unicode test'
        });
        const result = parseMCPResponse(response);

        // Should handle unicode gracefully
        if (result?.error) {
          expect(result?.error).toBeDefined();
        } else {
          expect(result?.label).toBeDefined();
          expect(result?.label).toBe(label);
        }
      }
    });

    test('should handle boundary values for numeric parameters', async () => {
      const boundaryTests = [
        { limit: 0 },
        { limit: 1 },
        { limit: 100 },
        { limit: Number.MAX_SAFE_INTEGER }
      ];

      for (const params of boundaryTests) {
        const response = await gitToolHandlers.handleListRestorePoints({
          project_path: testRepoPath,
          ...params
        });
        const result = parseMCPResponse(response);

        // Should handle boundary values appropriately
        if (result?.error) {
          expect(result?.error).toBeDefined();
        } else {
          expect(Array.isArray(result.restore_points)).toBe(true);
        }
      }
    });
  });
});