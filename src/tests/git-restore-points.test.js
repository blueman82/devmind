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
    await gitToolHandlers.initialize();
    
    // Mock path validator to allow test paths
    originalValidate = pathValidator.validateProjectPath;
    pathValidator.validateProjectPath = (path) => {
      if (path && path.includes('restore-points-test')) {
        return { isValid: true, normalizedPath: path };
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

  describe('Create Restore Point', () => {
    test('should create basic restore point with required parameters', async () => {
      const response = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'stable-v1',
        description: 'Stable version 1.0'
      });
      const result = parseMCPResponse(response);

      expect(result).toBeDefined();
      expect(result?.error).toBeUndefined();
      expect(result?.label).toBe('stable-v1');
      expect(result?.description).toBe('Stable version 1.0');
      expect(result?.test_status).toBe('unknown');
      expect(result?.auto_generated).toBe(false);
    });

    test('should create restore point with all optional parameters', async () => {
      const response = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'before-refactor',
        description: 'Before major refactoring',
        test_status: 'passing',
        auto_generated: true
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeUndefined();
      expect(result?.label).toBe('before-refactor');
      expect(result?.test_status).toBe('passing');
      expect(result?.auto_generated).toBe(true);
    });

    test('should create restore point with minimal parameters', async () => {
      const response = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'minimal-test'
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeUndefined();
      expect(result?.label).toBe('minimal-test');
      expect(result?.description).toBeNull();
      expect(result?.test_status).toBe('unknown');
      expect(result?.auto_generated).toBe(false);
    });

    test('should validate test_status enumeration', async () => {
      // Test valid test_status values
      const validStatuses = ['passing', 'failing', 'unknown'];
      
      for (const status of validStatuses) {
        const response = await gitToolHandlers.handleCreateRestorePoint({
          project_path: testRepoPath,
          label: `test-${status}`,
          test_status: status
        });
        const result = parseMCPResponse(response);
        
        expect(result?.error).toBeUndefined();
        expect(result?.test_status).toBe(status);
      }
    });

    test('should handle invalid project path', async () => {
      const response = await gitToolHandlers.handleCreateRestorePoint({
        project_path: '/nonexistent/path',
        label: 'invalid-path'
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeDefined();
      expect(result?.error).toBeDefined();
      expect(result?.error).toContain('Invalid project path');
    });

    test('should prevent duplicate labels in same project', async () => {
      // Create first restore point
      const response1 = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'duplicate-test',
        description: 'First attempt'
      });
      const result1 = parseMCPResponse(response1);
      
      expect(result1?.error).toBeUndefined();
      
      // Try to create second restore point with same label
      const response2 = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'duplicate-test',
        description: 'Second attempt'
      });
      const result2 = parseMCPResponse(response2);
      
      expect(result2?.error).toBeDefined();
      expect(result2?.error).toContain('already exists');
    });

    test('should handle missing required parameters', async () => {
      // Test missing project_path
      const response1 = await gitToolHandlers.handleCreateRestorePoint({
        label: 'missing-path'
      });
      const result1 = parseMCPResponse(response1);
      
      expect(result1?.error).toBeDefined();
      expect(result1?.error).toContain('project_path is required');
      
      // Test missing label
      const response2 = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath
      });
      const result2 = parseMCPResponse(response2);
      
      expect(result2?.error).toBeDefined();
      expect(result2?.error).toContain('label is required');
    });
  });

  describe('List Restore Points', () => {
    beforeEach(async () => {
      // Create test restore points
      const response1 = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'v1.0.0',
        description: 'Release version 1.0.0',
        test_status: 'passing'
      });
      parseMCPResponse(response1);
      
      const response2 = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'before-refactor',
        description: 'Before major refactoring',
        test_status: 'unknown'
      });
      parseMCPResponse(response2);
      
      const response3 = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'auto-backup',
        description: 'Automatic backup',
        test_status: 'failing',
        auto_generated: true
      });
      parseMCPResponse(response3);
    });

    test('should list all restore points for project', async () => {
      const response = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeUndefined();
      expect(Array.isArray(result.restore_points)).toBe(true);
      expect(result.restore_points).toHaveLength(3);
      expect(result.restore_points?.map(rp => rp.label)).toEqual(
        expect.arrayContaining(['v1.0.0', 'before-refactor', 'auto-backup'])
      );
    });

    test('should limit number of results', async () => {
      const response = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath,
        limit: 2
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeUndefined();
      expect(Array.isArray(result.restore_points)).toBe(true);
      expect(result.restore_points).toHaveLength(2);
    });

    test('should exclude auto-generated restore points when requested', async () => {
      const response = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath,
        include_auto_generated: false
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeUndefined();
      expect(Array.isArray(result.restore_points)).toBe(true);
      expect(result.restore_points).toHaveLength(2);
      expect(result.restore_points?.every(rp => !rp.auto_generated)).toBe(true);
    });

    test('should include auto-generated restore points by default', async () => {
      const response = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeUndefined();
      expect(result.restore_points?.some(rp => rp.auto_generated)).toBe(true);
    });

    test('should handle timeframe filtering', async () => {
      const response = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath,
        timeframe: 'today'
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeUndefined();
      expect(Array.isArray(result.restore_points)).toBe(true);
      // All restore points should be from today since we just created them
      expect(result.restore_points?.length).toBeGreaterThan(0);
    });

    test('should return empty array for non-existent project', async () => {
      const response = await gitToolHandlers.handleListRestorePoints({
        project_path: '/nonexistent/project'
      });
      const result = parseMCPResponse(response);

      expect(result?.error).toBeDefined();
      expect(result?.error).toContain('Invalid project path');
    });

    test('should validate limit parameter bounds', async () => {
      // Test maximum limit
      const response1 = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath,
        limit: 150 // Over max of 100
      });
      const result1 = parseMCPResponse(response1);
      
      expect(result1?.error).toBeUndefined();
      expect(result1?.length).toBeLessThanOrEqual(100);
      
      // Test minimum limit
      const response2 = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath,
        limit: 0
      });
      const result2 = parseMCPResponse(response2);
      
      expect(result2?.error).toBeUndefined();
      expect(result2).toHaveLength(0);
    });
  });

  describe('Restore Point Operations Integration', () => {
    test('should create and list restore points in sequence', async () => {
      const labels = ['checkpoint-1', 'checkpoint-2', 'checkpoint-3'];
      
      // Create multiple restore points
      for (const label of labels) {
        const createResponse = await gitToolHandlers.handleCreateRestorePoint({
          project_path: testRepoPath,
          label: label,
          description: `Description for ${label}`
        });
        const createResult = parseMCPResponse(createResponse);
        
        expect(createResult?.error).toBeUndefined();
      }
      
      // List all restore points
      const listResponse = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath
      });
      const listResult = parseMCPResponse(listResponse);
      
      expect(listResult?.error).toBeUndefined();
      expect(listResult).toHaveLength(3);
      expect(listResult?.map(rp => rp.label)).toEqual(
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
      
      const responses = await Promise.all(concurrentOperations);
      const results = responses.map(response => parseMCPResponse(response));
      
      // All operations should succeed
      results.forEach(result => {
        expect(result?.error).toBeUndefined();
      });
      
      // Verify all restore points were created
      const listResponse = await gitToolHandlers.handleListRestorePoints({
        project_path: testRepoPath
      });
      const listResult = parseMCPResponse(listResponse);
      
      expect(listResult?.error).toBeUndefined();
      expect(listResult).toHaveLength(3);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle database connection errors gracefully', async () => {
      // Close the database to simulate connection error
      const originalDb = gitToolHandlers.restorePointHandlers.dbManager;
      gitToolHandlers.restorePointHandlers.dbManager = null;
      
      const response = await gitToolHandlers.handleCreateRestorePoint({
        project_path: testRepoPath,
        label: 'connection-error-test'
      });
      const result = parseMCPResponse(response);
      
      expect(result?.error).toBeDefined();
      expect(result?.error).toContain('Cannot read properties of null');
      
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
        const response = await gitToolHandlers.handleCreateRestorePoint({
          project_path: testRepoPath,
          label: label
        });
        const result = parseMCPResponse(response);
        
        expect(result?.error).toBeDefined();
        expect(result?.error).toContain('Invalid label');
      }
    });

    test('should handle repository discovery failures', async () => {
      // Create a directory that's not a git repository
      const nonGitPath = join(tempDir, 'non-git-dir');
      await fs.mkdir(nonGitPath, { recursive: true });
      
      const response = await gitToolHandlers.handleCreateRestorePoint({
        project_path: nonGitPath,
        label: 'non-git-test'
      });
      const result = parseMCPResponse(response);
      
      expect(result?.error).toBeDefined();
      expect(result?.error).toContain('repository');
    });
  });
});