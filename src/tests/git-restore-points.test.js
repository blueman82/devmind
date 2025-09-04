import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { GitToolHandlers } from '../mcp-server/handlers/git-tool-handlers.js';
import DatabaseManager from '../database/database-manager.js';
import GitSchema from '../database/git-schema.js';
import pathValidator from '../utils/path-validator.js';

describe('Git Restore Points Management', () => {
  let tempDir;
  let tempDbPath;
  let dbManager;
  let gitSchema;
  let gitToolHandlers;
  let testRepoPath;
  let originalValidate;

  beforeAll(async () => {
    console.log('🔄 Setting up Git Restore Points test environment...');
    
    tempDir = join(tmpdir(), `restore-points-test-${Date.now()}`);
    tempDbPath = join(tmpdir(), `restore-points-${Date.now()}.db`);
    testRepoPath = join(tempDir, 'test-repo');
    
    await fs.mkdir(testRepoPath, { recursive: true });
    
    // Setup test repository with multiple commits
    execSync('git init', { cwd: testRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: testRepoPath });
    execSync('git config user.name "Test User"', { cwd: testRepoPath });
    
    // Create initial commit
    await fs.writeFile(join(testRepoPath, 'README.md'), '# Restore Points Test\n');
    execSync('git add .', { cwd: testRepoPath });
    execSync('git commit -m "Initial commit"', { cwd: testRepoPath });
    
    // Create feature branch and more commits
    execSync('git checkout -b feature/restore-test', { cwd: testRepoPath });
    await fs.writeFile(join(testRepoPath, 'feature.js'), 'console.log("Feature");');
    execSync('git add .', { cwd: testRepoPath });
    execSync('git commit -m "Add feature.js"', { cwd: testRepoPath });
    
    await fs.writeFile(join(testRepoPath, 'config.json'), '{"env": "test"}');
    execSync('git add .', { cwd: testRepoPath });
    execSync('git commit -m "Add configuration"', { cwd: testRepoPath });
    
    // Switch back to main branch
    execSync('git checkout main', { cwd: testRepoPath });
    
    // Initialize database components
    dbManager = new DatabaseManager(tempDbPath);
    await dbManager.initialize();
    gitSchema = new GitSchema(dbManager.db);
    await gitSchema.initialize();
    
    gitToolHandlers = new GitToolHandlers(dbManager, gitSchema);
    
    // Mock path validator to allow test paths
    originalValidate = pathValidator.validateProjectPath;
    pathValidator.validateProjectPath = (path) => {
      if (path && path.includes('restore-points-test')) {
        return { isValid: true, sanitizedPath: path };
      }
      return originalValidate(path);
    };
    
    console.log('✅ Git Restore Points test environment ready');
  });

  afterAll(async () => {
    console.log('🧹 Cleaning up Git Restore Points test environment...');
    
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
    
    console.log('✅ Git Restore Points cleanup complete');
  });

  beforeEach(async () => {
    // Clear restore points before each test
    const clearStmt = dbManager.db.prepare('DELETE FROM restore_points');
    clearStmt.run();
  });

  describe('Create Restore Point', () => {
    test('should create basic restore point with required parameters', async () => {
      const result = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'stable-v1',
        description: 'Stable version 1.0'
      });

      expect(result).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.label).toBe('stable-v1');
      expect(result.description).toBe('Stable version 1.0');
      expect(result.test_status).toBe('unknown');
      expect(result.auto_generated).toBe(false);
    });

    test('should create restore point with all optional parameters', async () => {
      const result = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'before-refactor',
        description: 'Before major refactoring',
        test_status: 'passing',
        auto_generated: true
      });

      expect(result.error).toBeUndefined();
      expect(result.label).toBe('before-refactor');
      expect(result.test_status).toBe('passing');
      expect(result.auto_generated).toBe(true);
    });

    test('should create restore point with minimal parameters', async () => {
      const result = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'minimal-test'
      });

      expect(result.error).toBeUndefined();
      expect(result.label).toBe('minimal-test');
      expect(result.description).toBeNull();
      expect(result.test_status).toBe('unknown');
      expect(result.auto_generated).toBe(false);
    });

    test('should validate test_status enumeration', async () => {
      // Test valid test_status values
      const validStatuses = ['passing', 'failing', 'unknown'];
      
      for (const status of validStatuses) {
        const result = await gitToolHandlers.handleCreateRestorePoint({
          project_path: testRepoPath,
          label: `test-${status}`,
          test_status: status
        });
        
        expect(result.error).toBeUndefined();
        expect(result.test_status).toBe(status);
      }
    });

    test('should handle invalid project path', async () => {
      const result = await gitToolHandlers.handleCreateRestorePoint({
        project_path: '/nonexistent/path',
        label: 'invalid-path'
      });

      expect(result.error).toBeDefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid project path');
    });

    test('should prevent duplicate labels in same project', async () => {
      // Create first restore point
      const result1 = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'duplicate-test',
        description: 'First attempt'
      });
      
      expect(result1.error).toBeUndefined();
      
      // Try to create second restore point with same label
      const result2 = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'duplicate-test',
        description: 'Second attempt'
      });
      
      expect(result2.error).toBeDefined();
      expect(result2.error).toContain('already exists');
    });

    test('should handle missing required parameters', async () => {
      // Test missing project_path
      const result1 = await gitToolHandlers.handleCreateRestorePoint({
        label: 'missing-path'
      });
      
      expect(result1.error).toBeDefined();
      expect(result1.error).toContain('project_path is required');
      
      // Test missing label
      const result2 = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath
      });
      
      expect(result2.error).toBeDefined();
      expect(result2.error).toContain('label is required');
    });
  });

  describe('List Restore Points', () => {
    beforeEach(async () => {
      // Create test restore points
      await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'v1.0.0',
        description: 'Release version 1.0.0',
        test_status: 'passing'
      });
      
      await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'before-refactor',
        description: 'Before major refactoring',
        test_status: 'unknown'
      });
      
      await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'auto-backup',
        description: 'Automatic backup',
        test_status: 'failing',
        auto_generated: true
      });
    });

    test('should list all restore points for project', async () => {
      const result = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath
      });

      expect(result.error).toBeUndefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(result.map(rp => rp.label)).toEqual(
        expect.arrayContaining(['v1.0.0', 'before-refactor', 'auto-backup'])
      );
    });

    test('should limit number of results', async () => {
      const result = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath,
        limit: 2
      });

      expect(result.error).toBeUndefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    test('should exclude auto-generated restore points when requested', async () => {
      const result = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath,
        include_auto_generated: false
      });

      expect(result.error).toBeUndefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result.every(rp => !rp.auto_generated)).toBe(true);
    });

    test('should include auto-generated restore points by default', async () => {
      const result = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath
      });

      expect(result.error).toBeUndefined();
      expect(result.some(rp => rp.auto_generated)).toBe(true);
    });

    test('should handle timeframe filtering', async () => {
      const result = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath,
        timeframe: 'today'
      });

      expect(result.error).toBeUndefined();
      expect(Array.isArray(result)).toBe(true);
      // All restore points should be from today since we just created them
      expect(result.length).toBeGreaterThan(0);
    });

    test('should return empty array for non-existent project', async () => {
      const result = await gitToolHandlers.handleListRestorePoints({
        project_path: '/nonexistent/project'
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid project path');
    });

    test('should validate limit parameter bounds', async () => {
      // Test maximum limit
      const result1 = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath,
        limit: 150 // Over max of 100
      });
      
      expect(result1.error).toBeUndefined();
      expect(result1.length).toBeLessThanOrEqual(100);
      
      // Test minimum limit
      const result2 = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath,
        limit: 0
      });
      
      expect(result2.error).toBeUndefined();
      expect(result2).toHaveLength(0);
    });
  });

  describe('Restore Point Operations Integration', () => {
    test('should create and list restore points in sequence', async () => {
      const labels = ['checkpoint-1', 'checkpoint-2', 'checkpoint-3'];
      
      // Create multiple restore points
      for (const label of labels) {
        const createResult = await gitToolHandlers.handleCreateRestorePoint({
          project_path: testRepoPath,
          label: label,
          description: `Description for ${label}`
        });
        
        expect(createResult.error).toBeUndefined();
      }
      
      // List all restore points
      const listResult = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath
      });
      
      expect(listResult.error).toBeUndefined();
      expect(listResult).toHaveLength(3);
      expect(listResult.map(rp => rp.label)).toEqual(
        expect.arrayContaining(labels)
      );
    });

    test('should handle concurrent restore point operations', async () => {
      const concurrentOperations = [
        gitToolHandlers.handleCreateRestorePoint({
          project_path: testRepoPath,
          label: 'concurrent-1',
          description: 'Concurrent operation 1'
        }),
        gitToolHandlers.handleCreateRestorePoint({
          project_path: testRepoPath,
          label: 'concurrent-2', 
          description: 'Concurrent operation 2'
        }),
        gitToolHandlers.handleCreateRestorePoint({
          project_path: testRepoPath,
          label: 'concurrent-3',
          description: 'Concurrent operation 3'
        })
      ];
      
      const results = await Promise.all(concurrentOperations);
      
      // All operations should succeed
      results.forEach(result => {
        expect(result.error).toBeUndefined();
      });
      
      // Verify all restore points were created
      const listResult = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath
      });
      
      expect(listResult.error).toBeUndefined();
      expect(listResult).toHaveLength(3);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle database connection errors gracefully', async () => {
      // Close the database to simulate connection error
      const originalDb = gitToolHandlers.dbManager;
      gitToolHandlers.dbManager = null;
      
      const result = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'connection-error-test'
      });
      
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Database connection');
      
      // Restore database connection
      gitToolHandlers.dbManager = originalDb;
    });

    test('should validate restore point label format', async () => {
      const invalidLabels = [
        '', // Empty
        '   ', // Whitespace only
        'label with spaces and special chars!@#',
        'a'.repeat(256), // Too long
      ];
      
      for (const label of invalidLabels) {
        const result = await gitToolHandlers.handleCreateRestorePoint({
          project_path: testRepoPath,
          label: label
        });
        
        expect(result.error).toBeDefined();
        expect(result.error).toContain('Invalid label');
      }
    });

    test('should handle repository discovery failures', async () => {
      // Create a directory that's not a git repository
      const nonGitPath = join(tempDir, 'non-git-dir');
      await fs.mkdir(nonGitPath, { recursive: true });
      
      const result = await gitToolHandlers.handleCreateRestorePoint({
        project_path: nonGitPath,
        label: 'non-git-test'
      });
      
      expect(result.error).toBeDefined();
      expect(result.error).toContain('repository');
    });
  });
});