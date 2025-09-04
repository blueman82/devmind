/**
 * Unit tests for Shadow Branch Manager
 * Phase 2 Implementation - AI Memory App
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the util module with a factory function approach
vi.mock('util', () => {
    const mockExecAsync = vi.fn();
    return {
        promisify: vi.fn(() => mockExecAsync),
        __mockExecAsync: mockExecAsync  // Export reference for test access
    };
});

// Mock the logger to prevent console output during tests
vi.mock('../utils/logger.js', () => ({
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }))
}));

import ShadowBranchManager from '../shadow-commit/shadow-branch-manager.js';
import * as util from 'util';

// Get reference to the mocked execAsync function
const mockExecAsync = util.__mockExecAsync;

describe('ShadowBranchManager', () => {
    let manager;
    
    beforeEach(() => {
        vi.clearAllMocks();
        mockExecAsync.mockReset();
        manager = new ShadowBranchManager();
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });
    
    describe('Constructor', () => {
        it('should initialize with default shadow prefix', () => {
            expect(manager.shadowPrefix).toBe('shadow/');
        });
        
        it('should accept custom shadow prefix', () => {
            const customManager = new ShadowBranchManager({ shadowPrefix: 'backup/' });
            expect(customManager.shadowPrefix).toBe('backup/');
        });
        
        it('should initialize empty repositories map', () => {
            expect(manager.repositories.size).toBe(0);
        });
    });
    
    describe('ensureShadowBranch', () => {
        it('should create shadow branch if it does not exist', async () => {
            // Setup mocks for the sequence of calls
            mockExecAsync
                .mockResolvedValueOnce({ stdout: 'feature-test\n', stderr: '' }) // getCurrentBranch
                .mockRejectedValueOnce(new Error('branch not found')) // branchExists (doesn't exist)
                .mockResolvedValueOnce({ stdout: '', stderr: '' }); // createBranch
            
            const result = await manager.ensureShadowBranch('/test/repo');
            
            expect(result).toEqual({
                shadowBranch: 'shadow/feature-test',
                originalBranch: 'feature-test',
                created: true
            });
            
            expect(mockExecAsync).toHaveBeenCalledTimes(3);
            expect(mockExecAsync).toHaveBeenNthCalledWith(1, 'git symbolic-ref --short HEAD', { cwd: '/test/repo' });
        });
        
        it('should return existing shadow branch without creating', async () => {
            // Setup mocks
            mockExecAsync
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: 'shadow/main', stderr: '' }); // branchExists (exists)
            
            const result = await manager.ensureShadowBranch('/test/repo');
            
            expect(result).toEqual({
                shadowBranch: 'shadow/main',
                originalBranch: 'main',
                created: false
            });
        });
        
        it('should throw error if no active branch found', async () => {
            // Mock git command failure for getCurrentBranch
            mockExecAsync.mockRejectedValueOnce(new Error('not a symbolic ref'));
            
            await expect(manager.ensureShadowBranch('/test/repo'))
                .rejects.toThrow('No active branch found');
        });
    });
    
    describe('getCurrentBranch', () => {
        it('should return current branch name', async () => {
            mockExecAsync.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
            
            const branch = await manager.getCurrentBranch('/test/repo');
            expect(branch).toBe('main');
        });
        
        it('should handle detached HEAD state', async () => {
            mockExecAsync.mockRejectedValueOnce(new Error('not a symbolic ref'));
            
            const branch = await manager.getCurrentBranch('/test/repo');
            expect(branch).toBeNull();
        });
    });
    
    describe('branchExists', () => {
        it('should return true if branch exists', async () => {
            mockExecAsync.mockResolvedValueOnce({ stdout: 'shadow/main', stderr: '' });
            
            const exists = await manager.branchExists('/test/repo', 'shadow/main');
            expect(exists).toBe(true);
        });
        
        it('should return false if branch does not exist', async () => {
            mockExecAsync.mockRejectedValueOnce(new Error('branch not found'));
            
            const exists = await manager.branchExists('/test/repo', 'nonexistent');
            expect(exists).toBe(false);
        });
    });
    
    describe('commitToShadowBranch', () => {
        it('should create commit with correct message and return hash', async () => {
            // Setup mocks
            mockExecAsync
                .mockResolvedValueOnce({ stdout: 'shadow/main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git add (files loop)
                .mockResolvedValueOnce({ stdout: '[shadow/main abc123] Test commit message\n 1 file changed, 1 insertion(+)', stderr: '' }) // git commit
                .mockResolvedValueOnce({ stdout: ' 1 file changed, 1 insertion(+)\n', stderr: '' }); // git diff --stat
            
            const result = await manager.commitToShadowBranch('/test/repo', 'shadow/main', 'Test commit message', ['test-file.js']);
            
            expect(result).toEqual({
                commitHash: 'abc123',
                filesChanged: 1,
                message: '[shadow/main abc123] Test commit message\n 1 file changed, 1 insertion(+)'
            });
        });
        
        it('should throw error if not on shadow branch', async () => {
            mockExecAsync.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }); // getCurrentBranch
            
            await expect(manager.commitToShadowBranch('/test/repo', 'shadow/main', 'Test message', ['test-file.js']))
                .rejects.toThrow('Not on shadow branch');
        });
    });
    
    describe('switchToShadowBranch', () => {
        it('should stash changes if uncommitted changes exist', async () => {
            mockExecAsync
                .mockResolvedValueOnce({ stdout: ' M file.txt\\n', stderr: '' }) // git status (has changes)
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git stash
                .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git checkout
            
            const result = await manager.switchToShadowBranch('/test/repo', 'shadow/main');
            
            expect(result.stashed).toBe(true);
            expect(mockExecAsync).toHaveBeenCalledWith('git stash push -m "Auto-commit: temporary stash"', { cwd: '/test/repo' });
        });
        
        it('should not stash if no uncommitted changes', async () => {
            mockExecAsync
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status (clean)
                .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git checkout
            
            const result = await manager.switchToShadowBranch('/test/repo', 'shadow/main');
            
            expect(result.stashed).toBe(false);
            expect(mockExecAsync).toHaveBeenCalledTimes(2);
        });
    });
    
    describe('syncShadowBranch', () => {
        it('should sync shadow branch with original if behind', async () => {
            mockExecAsync
                .mockResolvedValueOnce({ stdout: 'abc123\\ndef456\\n', stderr: '' }) // git log (behind)
                .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git merge
            
            const result = await manager.syncShadowBranch('/test/repo', 'shadow/main', 'main');
            
            expect(result.synced).toBe(true);
            expect(result.commitsBehind).toBe(2);
        });
        
        it('should not sync if already up to date', async () => {
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' }); // git log (up to date)
            
            const result = await manager.syncShadowBranch('/test/repo', 'shadow/main', 'main');
            
            expect(result.synced).toBe(false);
            expect(result.commitsBehind).toBe(0);
        });
    });
    
    describe('listShadowBranches', () => {
        it('should return list of shadow branches with originals', async () => {
            mockExecAsync.mockResolvedValueOnce({ 
                stdout: 'shadow/main\\nshadow/feature-test\\nshadow/bugfix\\n', 
                stderr: '' 
            });
            
            const branches = await manager.listShadowBranches('/test/repo');
            
            expect(branches).toHaveLength(3);
            expect(branches).toEqual([
                { shadowBranch: 'shadow/main', originalBranch: 'main' },
                { shadowBranch: 'shadow/feature-test', originalBranch: 'feature-test' },
                { shadowBranch: 'shadow/bugfix', originalBranch: 'bugfix' }
            ]);
        });
        
        it('should handle empty list', async () => {
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
            
            const branches = await manager.listShadowBranches('/test/repo');
            expect(branches).toHaveLength(0);
        });
    });
    
    describe('cleanupOrphanedShadowBranches', () => {
        it('should delete shadow branches without corresponding originals', async () => {
            mockExecAsync
                .mockResolvedValueOnce({ stdout: 'shadow/main\\nshadow/orphaned\\n', stderr: '' }) // list shadow branches
                .mockResolvedValueOnce({ stdout: 'main\\n', stderr: '' }) // list all branches
                .mockResolvedValueOnce({ stdout: '', stderr: '' }); // delete orphaned branch
            
            const result = await manager.cleanupOrphanedShadowBranches('/test/repo');
            
            expect(result).toEqual(['shadow/orphaned']);
            expect(mockExecAsync).toHaveBeenCalledWith('git branch -D shadow/orphaned', { cwd: '/test/repo' });
        });
        
        it('should handle no orphaned branches', async () => {
            mockExecAsync
                .mockResolvedValueOnce({ stdout: 'shadow/main\\n', stderr: '' }) // list shadow branches
                .mockResolvedValueOnce({ stdout: 'main\\n', stderr: '' }); // list all branches
            
            const result = await manager.cleanupOrphanedShadowBranches('/test/repo');
            expect(result).toHaveLength(0);
        });
    });
    
    describe('hasUncommittedChanges', () => {
        it('should return true if there are uncommitted changes', async () => {
            mockExecAsync.mockResolvedValueOnce({ stdout: ' M file.txt\\n', stderr: '' });
            
            const hasChanges = await manager.hasUncommittedChanges('/test/repo');
            expect(hasChanges).toBe(true);
        });
        
        it('should return false if working directory is clean', async () => {
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
            
            const hasChanges = await manager.hasUncommittedChanges('/test/repo');
            expect(hasChanges).toBe(false);
        });
        
        it('should handle git status errors gracefully', async () => {
            mockExecAsync.mockRejectedValueOnce(new Error('Not a git repository'));
            
            const hasChanges = await manager.hasUncommittedChanges('/test/repo');
            expect(hasChanges).toBe(false);
        });
    });
    
    describe('Error Handling', () => {
        it('should handle repository not found', async () => {
            mockExecAsync.mockRejectedValueOnce(new Error('fatal: not a git repository'));
            
            await expect(manager.getCurrentBranch('/nonexistent/repo'))
                .resolves.toBeNull();
        });
        
        it('should handle permission denied errors', async () => {
            mockExecAsync.mockRejectedValueOnce(new Error('Permission denied'));
            
            await expect(manager.getCurrentBranch('/protected/repo'))
                .resolves.toBeNull();
        });
        
        it('should log errors through logger', async () => {
            const loggerSpy = vi.spyOn(manager.logger, 'warn');
            mockExecAsync.mockRejectedValueOnce(new Error('Test error'));
            
            await manager.getCurrentBranch('/test/repo');
            
            expect(loggerSpy).toHaveBeenCalledWith('Failed to get current branch:', expect.any(Error));
        });
    });
});

console.log('🧪 Starting Shadow Branch Manager tests...\\n');