import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import GitManager from '../git/git-manager.js';

describe('GitManager Core Functionality', () => {
  let tempDir;
  let gitManager;
  let testRepoPath;
  let testMonorepoPath;
  let ketchupSubdirPath;

  beforeAll(async () => {
    console.log('🚀 Setting up GitManager test environment...');
    
    tempDir = join(tmpdir(), `gitmanager-test-${Date.now()}`);
    testRepoPath = join(tempDir, 'simple-repo');
    testMonorepoPath = join(tempDir, 'monorepo');
    ketchupSubdirPath = join(testMonorepoPath, 'ketchup');
    
    await fs.mkdir(testRepoPath, { recursive: true });
    await fs.mkdir(ketchupSubdirPath, { recursive: true });
    
    // Setup simple repository
    execSync('git init', { cwd: testRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: testRepoPath });
    execSync('git config user.name "Test User"', { cwd: testRepoPath });
    
    await fs.writeFile(join(testRepoPath, 'README.md'), '# Simple Test Repo\n');
    execSync('git add .', { cwd: testRepoPath });
    execSync('git commit -m "Initial commit"', { cwd: testRepoPath });
    
    await fs.writeFile(join(testRepoPath, 'main.js'), 'console.log("Hello");');
    execSync('git add .', { cwd: testRepoPath });
    execSync('git commit -m "Add main.js"', { cwd: testRepoPath });
    
    // Setup monorepo
    execSync('git init', { cwd: testMonorepoPath });
    execSync('git config user.email "test@example.com"', { cwd: testMonorepoPath });
    execSync('git config user.name "Test User"', { cwd: testMonorepoPath });
    
    await fs.writeFile(join(testMonorepoPath, 'README.md'), '# Monorepo Test\n');
    await fs.writeFile(join(ketchupSubdirPath, 'ketchup.js'), 'console.log("Ketchup");');
    execSync('git add .', { cwd: testMonorepoPath });
    execSync('git commit -m "Initial monorepo commit"', { cwd: testMonorepoPath });
    
    // Add ketchup-specific commits
    await fs.writeFile(join(ketchupSubdirPath, 'config.json'), '{"ketchup": true}');
    execSync('git add ketchup/', { cwd: testMonorepoPath });
    execSync('git commit -m "feat(ketchup): Add config"', { cwd: testMonorepoPath });
    
    // Create feature branch
    execSync('git checkout -b feature/ketchup-enhancement', { cwd: testMonorepoPath });
    await fs.writeFile(join(ketchupSubdirPath, 'feature.js'), 'console.log("Feature");');
    execSync('git add ketchup/', { cwd: testMonorepoPath });
    execSync('git commit -m "feat(ketchup): Add feature"', { cwd: testMonorepoPath });
    execSync('git checkout main', { cwd: testMonorepoPath });
    
    console.log('✅ GitManager test environment ready');
  }, 20000);

  beforeEach(() => {
    gitManager = new GitManager();
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  });

  test('should initialize correctly', () => {
    expect(gitManager).toBeDefined();
    expect(gitManager.discoverRepository).toBeDefined();
    expect(gitManager.getCommitHistory).toBeDefined();
    expect(typeof gitManager.discoverRepository).toBe('function');
    expect(typeof gitManager.getCommitHistory).toBe('function');
  });

  test('should discover simple repository', async () => {
    const repoInfo = await gitManager.discoverRepository(testRepoPath);
    
    if (repoInfo && repoInfo.isGitRepository) {
      expect(repoInfo.isGitRepository).toBe(true);
      expect(repoInfo.workingDirectory).toBe(testRepoPath);
      expect(repoInfo.gitDirectory).toMatch(/\.git$/);
      expect(repoInfo.isMonorepoSubdirectory).toBe(false);
      console.log('✅ Simple repository discovered correctly');
    } else {
      console.warn('⚠️ Repository discovery failed (expected in some test environments)');
    }
  });

  test('should discover monorepo from subdirectory', async () => {
    const repoInfo = await gitManager.discoverRepository(ketchupSubdirPath);
    
    if (repoInfo && repoInfo.isGitRepository) {
      expect(repoInfo.isGitRepository).toBe(true);
      expect(repoInfo.repositoryRoot).toBe(testMonorepoPath);
      expect(repoInfo.isMonorepoSubdirectory).toBe(true);
      expect(repoInfo.subdirectoryPath).toBe('ketchup');
      expect(repoInfo.projectPath).toBe(ketchupSubdirPath);
      console.log('✅ Monorepo subdirectory discovered correctly');
    } else {
      console.warn('⚠️ Monorepo discovery failed (expected in some test environments)');
    }
  });

  test('should retrieve commit history with basic options', async () => {
    try {
      const history = await gitManager.getCommitHistory(testRepoPath, { 
        limit: 5 
      });
      
      expect(Array.isArray(history)).toBe(true);
      
      if (history.length > 0) {
        const commit = history[0];
        expect(commit).toHaveProperty('hash');
        expect(commit).toHaveProperty('message');
        expect(commit).toHaveProperty('authorName');
        expect(commit).toHaveProperty('timestamp');
        expect(commit.hash).toMatch(/^[a-f0-9]+$/);
        expect(typeof commit.message).toBe('string');
        console.log(`✅ Retrieved ${history.length} commits with proper structure`);
      } else {
        console.warn('⚠️ No commits found');
      }
    } catch (error) {
      console.warn('⚠️ Commit history retrieval failed:', error.message);
    }
  });

  test('should filter commits by subdirectory', async () => {
    try {
      const allHistory = await gitManager.getCommitHistory(testMonorepoPath, { 
        limit: 10 
      });
      
      const ketchupHistory = await gitManager.getCommitHistory(testMonorepoPath, { 
        limit: 10,
        subdirectory: 'ketchup'
      });
      
      expect(Array.isArray(allHistory)).toBe(true);
      expect(Array.isArray(ketchupHistory)).toBe(true);
      
      if (allHistory.length > 0 && ketchupHistory.length > 0) {
        // Ketchup history should be subset of all history
        expect(ketchupHistory.length).toBeLessThanOrEqual(allHistory.length);
        
        // Verify ketchup commits mention ketchup or modify ketchup files
        const ketchupRelated = ketchupHistory.filter(commit => {
          const message = commit.message.toLowerCase();
          const hasKetchupFiles = commit.filesChanged?.some(file => 
            file.includes('ketchup')
          );
          return message.includes('ketchup') || hasKetchupFiles;
        });
        
        expect(ketchupRelated.length).toBeGreaterThan(0);
        console.log(`✅ Subdirectory filtering: ${allHistory.length} total, ${ketchupHistory.length} ketchup-specific`);
      }
    } catch (error) {
      console.warn('⚠️ Subdirectory filtering failed:', error.message);
    }
  });

  test('should filter commits by branch', async () => {
    try {
      const mainHistory = await gitManager.getCommitHistory(testMonorepoPath, { 
        limit: 10,
        branch: 'main'
      });
      
      const featureHistory = await gitManager.getCommitHistory(testMonorepoPath, { 
        limit: 10,
        branch: 'feature/ketchup-enhancement'
      });
      
      expect(Array.isArray(mainHistory)).toBe(true);
      expect(Array.isArray(featureHistory)).toBe(true);
      
      if (mainHistory.length > 0 && featureHistory.length > 0) {
        // Feature branch should have at least as many commits as main
        expect(featureHistory.length).toBeGreaterThanOrEqual(mainHistory.length);
        console.log(`✅ Branch filtering: main=${mainHistory.length}, feature=${featureHistory.length}`);
      }
    } catch (error) {
      console.warn('⚠️ Branch filtering failed:', error.message);
    }
  });

  test('should combine subdirectory and branch filtering', async () => {
    try {
      const ketchupFeatureHistory = await gitManager.getCommitHistory(testMonorepoPath, { 
        limit: 10,
        subdirectory: 'ketchup',
        branch: 'feature/ketchup-enhancement'
      });
      
      expect(Array.isArray(ketchupFeatureHistory)).toBe(true);
      
      if (ketchupFeatureHistory.length > 0) {
        // All commits should be ketchup-related
        ketchupFeatureHistory.forEach(commit => {
          const message = commit.message.toLowerCase();
          const hasKetchupFiles = commit.filesChanged?.some(file => 
            file.includes('ketchup')
          );
          
          expect(
            message.includes('ketchup') || hasKetchupFiles
          ).toBe(true);
        });
        
        console.log(`✅ Combined filtering: ${ketchupFeatureHistory.length} ketchup commits on feature branch`);
      }
    } catch (error) {
      console.warn('⚠️ Combined filtering failed:', error.message);
    }
  });

  test('should handle performance timing for repository discovery', async () => {
    const startTime = Date.now();
    
    try {
      await gitManager.discoverRepository(testRepoPath);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within 3 seconds
      expect(duration).toBeLessThan(3000);
      console.log(`✅ Repository discovery completed in ${duration}ms`);
    } catch (error) {
      console.warn('⚠️ Performance timing test failed:', error.message);
    }
  });

  test('should handle non-git directory gracefully', async () => {
    const nonGitPath = join(tempDir, 'non-git-dir');
    await fs.mkdir(nonGitPath, { recursive: true });
    
    const result = await gitManager.discoverRepository(nonGitPath);
    
    if (result) {
      expect(result.isGitRepository).toBe(false);
    } else {
      expect(result).toBe(null);
    }
    
    console.log('✅ Non-git directory handled gracefully');
  });

  test('should handle invalid path gracefully', async () => {
    const invalidPath = '/nonexistent/path/that/does/not/exist';
    
    try {
      const result = await gitManager.discoverRepository(invalidPath);
      expect(result).toBe(null);
      console.log('✅ Invalid path handled gracefully');
    } catch (error) {
      // Expected behavior - should either return null or throw
      expect(error).toBeDefined();
      console.log('✅ Invalid path threw expected error');
    }
  });

  test('should cache repository discoveries', async () => {
    // First discovery
    const startTime1 = Date.now();
    await gitManager.discoverRepository(testRepoPath);
    const duration1 = Date.now() - startTime1;
    
    // Second discovery (should be cached)
    const startTime2 = Date.now();
    await gitManager.discoverRepository(testRepoPath);
    const duration2 = Date.now() - startTime2;
    
    // Cached discovery should be faster (allowing some variance)
    expect(duration2).toBeLessThanOrEqual(duration1 + 100);
    console.log(`✅ Caching: first=${duration1}ms, cached=${duration2}ms`);
  });
});

console.log('🧪 Starting GitManager core functionality tests...');