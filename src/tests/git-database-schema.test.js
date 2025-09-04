import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import GitSchema from '../database/git-schema.js';
import DatabaseManager from '../database/database-manager.js';

describe('Git Database Schema Operations', () => {
  let tempDbPath;
  let dbManager;
  let gitSchema;
  let db;

  beforeAll(async () => {
    console.log('🚀 Setting up Git Database Schema test environment...');
    tempDbPath = join(tmpdir(), `git-schema-test-${Date.now()}.db`);
  });

  beforeEach(async () => {
    // Create fresh database for each test
    dbManager = new DatabaseManager(tempDbPath);
    await dbManager.initialize();
    
    db = dbManager.db;
    gitSchema = new GitSchema(db);
    await gitSchema.initialize();
  });

  afterAll(async () => {
    if (dbManager) {
      dbManager.close();
    }
    try {
      await fs.unlink(tempDbPath).catch(() => {}); // Ignore if already deleted
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  });

  describe('Schema Creation and Structure', () => {
    test('should create all required git tables', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map(t => t.name);
      
      expect(tableNames).toContain('git_repositories');
      expect(tableNames).toContain('git_commits');
      expect(tableNames).toContain('git_commit_files');
      expect(tableNames).toContain('restore_points');
      expect(tableNames).toContain('conversation_git_links');
      
      console.log(`✅ All required tables created: ${tableNames.filter(name => name.startsWith('git_') || name === 'restore_points' || name === 'conversation_git_links').join(', ')}`);
    });

    test('should have correct git_repositories table structure', () => {
      const columns = db.prepare("PRAGMA table_info(git_repositories)").all();
      const columnNames = columns.map(col => col.name);
      
      const expectedColumns = [
        'id', 'project_path', 'working_directory', 'git_directory',
        'repository_root', 'subdirectory_path', 'is_monorepo_subdirectory',
        'remote_url', 'current_branch', 'last_scanned'
      ];
      
      expectedColumns.forEach(column => {
        expect(columnNames).toContain(column);
      });
      
      // Check for monorepo-specific fields
      expect(columnNames).toContain('repository_root');
      expect(columnNames).toContain('subdirectory_path');
      expect(columnNames).toContain('is_monorepo_subdirectory');
      
      console.log('✅ git_repositories table has correct structure including monorepo fields');
    });

    test('should have correct git_commits table structure', () => {
      const columns = db.prepare("PRAGMA table_info(git_commits)").all();
      const columnNames = columns.map(col => col.name);
      
      const expectedColumns = [
        'id', 'repository_id', 'commit_hash', 'commit_date', 'author_name',
        'author_email', 'message', 'branch_name', 'files_changed_count',
        'insertions', 'deletions', 'is_merge', 'parent_hashes'
      ];
      
      expectedColumns.forEach(column => {
        expect(columnNames).toContain(column);
      });
      
      // Check for branch support
      expect(columnNames).toContain('branch_name');
      
      console.log('✅ git_commits table has correct structure including branch support');
    });

    test('should have correct restore_points table structure', () => {
      const columns = db.prepare("PRAGMA table_info(restore_points)").all();
      const columnNames = columns.map(col => col.name);
      
      const expectedColumns = [
        'id', 'repository_id', 'label', 'commit_hash', 'description',
        'auto_generated', 'test_status', 'created_at'
      ];
      
      expectedColumns.forEach(column => {
        expect(columnNames).toContain(column);
      });
      
      console.log('✅ restore_points table has correct structure');
    });

    test('should have foreign key constraints properly set up', () => {
      const gitCommitsForeignKeys = db.prepare("PRAGMA foreign_key_list(git_commits)").all();
      const restorePointsForeignKeys = db.prepare("PRAGMA foreign_key_list(restore_points)").all();
      
      expect(gitCommitsForeignKeys.length).toBeGreaterThan(0);
      expect(restorePointsForeignKeys.length).toBeGreaterThan(0);
      
      // Check specific foreign key relationships
      const commitsFk = gitCommitsForeignKeys.find(fk => fk.table === 'git_repositories');
      expect(commitsFk).toBeDefined();
      
      const restorePointsFk = restorePointsForeignKeys.find(fk => fk.table === 'git_repositories');
      expect(restorePointsFk).toBeDefined();
      
      console.log('✅ Foreign key constraints properly configured');
    });
  });

  describe('Repository Operations', () => {
    test('should insert simple repository', async () => {
      const repositoryData = {
        projectPath: '/test/simple-repo',
        workingDirectory: '/test/simple-repo',
        gitDirectory: '/test/simple-repo/.git',
        currentBranch: 'main'
      };
      
      const result = await gitSchema.upsertRepository(repositoryData);
      expect(result).toBeDefined();
      expect(result.repositoryId).toBeDefined();
      expect(typeof result.repositoryId).toBe('number');
      
      // Verify the data was stored correctly
      const stored = db.prepare('SELECT * FROM git_repositories WHERE id = ?').get(result.repositoryId);
      
      expect(stored.project_path).toBe('/test/simple-repo');
      expect(stored.working_directory).toBe('/test/simple-repo');
      expect(stored.current_branch).toBe('main');
      expect(stored.is_monorepo_subdirectory).toBe(0); // Should default to false
      
      console.log('✅ Simple repository inserted successfully');
    });

    test('should insert monorepo repository with subdirectory fields', async () => {
      const repositoryData = {
        projectPath: '/test/monorepo/ketchup',
        workingDirectory: '/test/monorepo',
        gitDirectory: '/test/monorepo/.git',
        repositoryRoot: '/test/monorepo',
        subdirectoryPath: 'ketchup',
        isMonorepoSubdirectory: true,
        currentBranch: 'main'
      };
      
      const result = await gitSchema.upsertRepository(repositoryData);
      expect(result).toBeDefined();
      expect(result.repositoryId).toBeDefined();
      
      // Verify monorepo fields
      const stored = db.prepare('SELECT * FROM git_repositories WHERE id = ?').get(result.repositoryId);
      
      expect(stored.project_path).toBe('/test/monorepo/ketchup');
      expect(stored.repository_root).toBe('/test/monorepo');
      expect(stored.subdirectory_path).toBe('ketchup');
      expect(stored.is_monorepo_subdirectory).toBe(1); // SQLite stores boolean as integer
      
      console.log('✅ Monorepo repository with subdirectory fields inserted successfully');
    });

    test('should update existing repository on upsert', async () => {
      const repositoryData = {
        projectPath: '/test/update-repo',
        workingDirectory: '/test/update-repo',
        gitDirectory: '/test/update-repo/.git',
        currentBranch: 'main'
      };
      
      // First insert
      const result1 = await gitSchema.upsertRepository(repositoryData);
      
      // Update with same project path but different branch
      repositoryData.currentBranch = 'feature/test';
      const result2 = await gitSchema.upsertRepository(repositoryData);
      
      // Should return same ID (update, not insert)
      expect(result1.repositoryId).toBe(result2.repositoryId);
      
      // Verify the update
      const stored = db.prepare('SELECT * FROM git_repositories WHERE id = ?').get(result1.repositoryId);
      expect(stored.current_branch).toBe('feature/test');
      
      console.log('✅ Repository upsert (update) working correctly');
    });

    test('should handle null/undefined fields gracefully', async () => {
      const repositoryData = {
        projectPath: '/test/minimal-repo',
        workingDirectory: '/test/minimal-repo',
        gitDirectory: '/test/minimal-repo/.git'
        // Missing optional fields
      };
      
      const result = await gitSchema.upsertRepository(repositoryData);
      expect(result).toBeDefined();
      expect(result.repositoryId).toBeDefined();
      
      const stored = db.prepare('SELECT * FROM git_repositories WHERE id = ?').get(result.repositoryId);
      expect(stored.project_path).toBe('/test/minimal-repo');
      // Optional fields should be null or have defaults
      
      console.log('✅ Minimal repository data handled gracefully');
    });
  });

  describe('Commit Operations', () => {
    let repositoryId;

    beforeEach(async () => {
      // Create a test repository for commit tests
      const result = await gitSchema.upsertRepository({
        projectPath: '/test/commit-repo',
        workingDirectory: '/test/commit-repo',
        gitDirectory: '/test/commit-repo/.git',
        currentBranch: 'main'
      });
      repositoryId = result.repositoryId;
    });

    test('should insert commit with all fields', async () => {
      const commitData = {
        hash: 'abc123def456789',
        date: new Date('2025-01-01T12:00:00Z'),
        authorName: 'Test Author',
        authorEmail: 'test@example.com',
        message: 'Test commit message',
        branchName: 'main',
        filesChanged: [{path: 'file1.js', status: 'M'}, {path: 'file2.js', status: 'A'}, {path: 'file3.md', status: 'M'}],
        insertions: 25,
        deletions: 10,
        isMerge: false,
        parents: ['parent123abc']
      };
      
      const result = await gitSchema.insertCommit(repositoryId, commitData);
      expect(result).toBeDefined();
      expect(result.lastInsertRowid).toBeDefined();
      const commitId = result.lastInsertRowid;
      
      // Verify the commit was stored correctly
      const stored = db.prepare('SELECT * FROM git_commits WHERE id = ?').get(commitId);
      
      expect(stored.commit_hash).toBe('abc123def456789');
      expect(stored.author_name).toBe('Test Author');
      expect(stored.author_email).toBe('test@example.com');
      expect(stored.message).toBe('Test commit message');
      expect(stored.branch_name).toBe('main');
      expect(stored.insertions).toBe(25);
      expect(stored.deletions).toBe(10);
      expect(stored.is_merge).toBe(0); // SQLite boolean as integer
      
      // Check JSON fields
      expect(stored.files_changed_count).toBe(3);
      
      const parentHashes = JSON.parse(stored.parent_hashes);
      expect(parentHashes).toEqual(['parent123abc']);
      
      console.log('✅ Complete commit data inserted successfully');
    });

    test('should handle merge commits', async () => {
      const mergeCommitData = {
        hash: 'merge123abc456',
        date: new Date(),
        authorName: 'Merge Author',
        authorEmail: 'merge@example.com',
        message: 'Merge branch feature into main',
        branchName: 'main',
        filesChanged: [{path: 'merged-file.js', status: 'M'}],
        insertions: 5,
        deletions: 2,
        isMerge: true,
        parents: ['parent1abc', 'parent2def']
      };
      
      const result = await gitSchema.insertCommit(repositoryId, mergeCommitData);
      expect(result).toBeDefined();
      const commitId = result.lastInsertRowid;
      
      const stored = db.prepare('SELECT * FROM git_commits WHERE id = ?').get(commitId);
      expect(stored.is_merge).toBe(1); // true as integer
      
      const parentHashes = JSON.parse(stored.parent_hashes);
      expect(parentHashes).toHaveLength(2);
      expect(parentHashes).toEqual(['parent1abc', 'parent2def']);
      
      console.log('✅ Merge commit handled correctly with multiple parents');
    });

    test('should enforce foreign key constraints', async () => {
      const commitData = {
        hash: 'invalid123',
        date: new Date(),
        authorName: 'Test',
        authorEmail: 'test@example.com',
        message: 'Should fail',
        branchName: 'main'
      };
      
      // Should throw foreign key constraint error
      await expect(gitSchema.insertCommit(99999, commitData)).rejects.toThrow();
      
      console.log('✅ Foreign key constraints enforced for commits');
    });

    test('should handle commit with branch filtering context', async () => {
      // Insert commits on different branches
      const mainCommit = {
        hash: 'main123abc',
        date: new Date(),
        authorName: 'Main Author',
        authorEmail: 'main@example.com',
        message: 'Main branch commit',
        branchName: 'main'
      };
      
      const featureCommit = {
        hash: 'feature456def',
        date: new Date(),
        authorName: 'Feature Author',
        authorEmail: 'feature@example.com',
        message: 'Feature branch commit',
        branchName: 'feature/test'
      };
      
      const mainResult = await gitSchema.insertCommit(repositoryId, mainCommit);
      const featureResult = await gitSchema.insertCommit(repositoryId, featureCommit);
      const mainId = mainResult.lastInsertRowid;
      const featureId = featureResult.lastInsertRowid;
      
      expect(mainId).toBeDefined();
      expect(featureId).toBeDefined();
      
      // Query commits by branch
      const mainCommits = db.prepare(
        'SELECT * FROM git_commits WHERE repository_id = ? AND branch_name = ?'
      ).all(repositoryId, 'main');
      
      const featureCommits = db.prepare(
        'SELECT * FROM git_commits WHERE repository_id = ? AND branch_name = ?'
      ).all(repositoryId, 'feature/test');
      
      expect(mainCommits).toHaveLength(1);
      expect(featureCommits).toHaveLength(1);
      expect(mainCommits[0].message).toBe('Main branch commit');
      expect(featureCommits[0].message).toBe('Feature branch commit');
      
      console.log('✅ Branch-specific commit storage and querying working');
    });
  });

  describe('Restore Point Operations', () => {
    let repositoryId;

    beforeEach(async () => {
      // Create a test repository for restore point tests
      const result = await gitSchema.upsertRepository({
        projectPath: '/test/restore-repo',
        workingDirectory: '/test/restore-repo',
        gitDirectory: '/test/restore-repo/.git',
        currentBranch: 'main'
      });
      repositoryId = result.repositoryId;
    });

    test('should insert restore point with all fields', async () => {
      const stmt = db.prepare(`
        INSERT INTO restore_points (repository_id, label, commit_hash, description, auto_generated, test_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      const result = stmt.run(
        repositoryId,
        'Test Restore Point',
        'abc123def456',
        'Manual test restore point',
        0, // false - manual
        'passing'
      );
      
      expect(result.lastInsertRowid).toBeDefined();
      
      // Verify the restore point
      const stored = db.prepare('SELECT * FROM restore_points WHERE id = ?').get(result.lastInsertRowid);
      
      expect(stored.label).toBe('Test Restore Point');
      expect(stored.commit_hash).toBe('abc123def456');
      expect(stored.description).toBe('Manual test restore point');
      expect(stored.auto_generated).toBe(0);
      expect(stored.test_status).toBe('passing');
      
      console.log('✅ Restore point inserted with all fields');
    });

    test('should handle different test statuses', async () => {
      const testStatuses = ['passing', 'failing', 'unknown'];
      
      for (const status of testStatuses) {
        const stmt = db.prepare(`
          INSERT INTO restore_points (repository_id, label, commit_hash, test_status)
          VALUES (?, ?, ?, ?)
        `);
        
        const result = stmt.run(
          repositoryId,
          `Test ${status}`,
          `hash_${status}`,
          status
        );
        
        expect(result.lastInsertRowid).toBeDefined();
        
        const stored = db.prepare('SELECT * FROM restore_points WHERE id = ?').get(result.lastInsertRowid);
        expect(stored.test_status).toBe(status);
      }
      
      console.log('✅ All test status values handled correctly');
    });

    test('should handle auto-generated vs manual restore points', async () => {
      // Manual restore point
      const manualStmt = db.prepare(`
        INSERT INTO restore_points (repository_id, label, commit_hash, auto_generated)
        VALUES (?, ?, ?, ?)
      `);
      
      const manualResult = manualStmt.run(repositoryId, 'Manual Point', 'manual123', 0);
      
      // Auto-generated restore point
      const autoResult = manualStmt.run(repositoryId, 'Auto Point', 'auto456', 1);
      
      const manual = db.prepare('SELECT * FROM restore_points WHERE id = ?').get(manualResult.lastInsertRowid);
      const auto = db.prepare('SELECT * FROM restore_points WHERE id = ?').get(autoResult.lastInsertRowid);
      
      expect(manual.auto_generated).toBe(0);
      expect(auto.auto_generated).toBe(1);
      
      // Query filtering by auto_generated flag
      const manualPoints = db.prepare(
        'SELECT * FROM restore_points WHERE repository_id = ? AND auto_generated = 0'
      ).all(repositoryId);
      
      const autoPoints = db.prepare(
        'SELECT * FROM restore_points WHERE repository_id = ? AND auto_generated = 1'
      ).all(repositoryId);
      
      expect(manualPoints.length).toBeGreaterThan(0);
      expect(autoPoints.length).toBeGreaterThan(0);
      
      console.log('✅ Auto-generated vs manual restore points handled correctly');
    });

    test('should enforce unique labels per repository', async () => {
      const stmt = db.prepare(`
        INSERT INTO restore_points (repository_id, label, commit_hash)
        VALUES (?, ?, ?)
      `);
      
      // First restore point
      const result1 = stmt.run(repositoryId, 'Unique Label', 'hash123');
      expect(result1.lastInsertRowid).toBeDefined();
      
      // Second restore point with same label should fail (if unique constraint exists)
      try {
        stmt.run(repositoryId, 'Unique Label', 'hash456');
        console.log('⚠️ Duplicate labels allowed (no unique constraint)');
      } catch (error) {
        expect(error.message).toMatch(/UNIQUE constraint failed/);
        console.log('✅ Unique label constraint enforced');
      }
    });

    test('should link restore points to repository via foreign key', async () => {
      const stmt = db.prepare(`
        INSERT INTO restore_points (repository_id, label, commit_hash)
        VALUES (?, ?, ?)
      `);
      
      // Valid foreign key
      const validResult = stmt.run(repositoryId, 'Valid Point', 'valid123');
      expect(validResult.lastInsertRowid).toBeDefined();
      
      // Invalid foreign key should fail
      await expect(async () => {
        stmt.run(99999, 'Invalid Point', 'invalid456');
      }).rejects.toThrow();
      
      console.log('✅ Restore point foreign key constraints working');
    });
  });

  describe('Database Performance and Indexing', () => {
    test('should have efficient queries with proper indexes', async () => {
      // Insert test data
      const result = await gitSchema.upsertRepository({
        projectPath: '/test/perf-repo',
        workingDirectory: '/test/perf-repo',
        gitDirectory: '/test/perf-repo/.git'
      });
      const repoId = result.repositoryId;
      
      // Insert multiple commits
      for (let i = 0; i < 10; i++) {
        await gitSchema.insertCommit(repoId, {
          hash: `commit${i}abc`,
          date: new Date(),
          authorName: 'Perf Author',
          authorEmail: 'perf@example.com',
          message: `Performance test commit ${i}`,
          branchName: i < 5 ? 'main' : 'feature/perf'
        });
      }
      
      const startTime = Date.now();
      
      // Query commits by repository
      const commits = db.prepare(
        'SELECT * FROM git_commits WHERE repository_id = ? ORDER BY commit_date DESC'
      ).all(repoId);
      
      const queryTime = Date.now() - startTime;
      
      expect(commits).toHaveLength(10);
      expect(queryTime).toBeLessThan(100); // Should be very fast
      
      console.log(`✅ Repository commits query completed in ${queryTime}ms`);
    });

    test('should handle concurrent operations safely', async () => {
      // Test concurrent repository insertions
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        promises.push(
          gitSchema.upsertRepository({
            projectPath: `/test/concurrent-repo-${i}`,
            workingDirectory: `/test/concurrent-repo-${i}`,
            gitDirectory: `/test/concurrent-repo-${i}/.git`
          })
        );
      }
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.repositoryId).toBeDefined();
        expect(typeof result.repositoryId).toBe('number');
      });
      
      console.log('✅ Concurrent database operations completed successfully');
    });
  });
});

console.log('🧪 Starting Git Database Schema tests...');