/**
 * Unit tests for Shadow Branch Manager
 * Phase 2 Implementation - AI Memory App
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the util module with factory function that creates fresh mocks
vi.mock('util', () => {
    return {
        promisify: vi.fn((fn) => {
            // Return a mock function that can be configured in tests
            return vi.fn();
        })
    };
});

import ShadowBranchManager from '../shadow-commit/shadow-branch-manager.js';

// Mock the logger to prevent console output during tests
vi.mock('../utils/logger.js', () => ({
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }))
}));

describe('ShadowBranchManager', () => {
    let manager;
    
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Reset the mock function
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
            const customManager = new ShadowBranchManager({ shadowPrefix: 'auto/' });
            expect(customManager.shadowPrefix).toBe('auto/');
        });
        
        it('should initialize empty repositories map', () => {
            expect(manager.repositories).toBeInstanceOf(Map);
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
            expect(mockExecAsync).toHaveBeenNthCalledWith(2, 
                'git show-ref --verify refs/heads/shadow/feature-test', 
                { cwd: '/test/repo' }
            );
            expect(mockExecAsync).toHaveBeenNthCalledWith(3, 
                'git branch "shadow/feature-test" "feature-test"', 
                { cwd: '/test/repo' }
            );
        });
        
        it('should return existing shadow branch without creating', async () => {
            mockExecAsync
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: 'abc123 refs/heads/shadow/main\n', stderr: '' }); // branchExists
            
            const result = await manager.ensureShadowBranch('/test/repo');
            
            expect(result).toEqual({
                shadowBranch: 'shadow/main',
                originalBranch: 'main',
                created: false
            });
            
            expect(mockExecAsync).toHaveBeenCalledTimes(2);
        });
        
        it('should throw error if no active branch found', async () => {
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
            mockExecAsync.mockResolvedValueOnce({ 
                stdout: 'abc123 refs/heads/shadow/main\n', 
                stderr: '' 
            });
            
            const exists = await manager.branchExists('/test/repo', 'shadow/main');
            expect(exists).toBe(true);
        });
        
        it('should return false if branch does not exist', async () => {
            mockExecAsync.mockRejectedValueOnce(new Error('branch not found'));
            
            const exists = await manager.branchExists('/test/repo', 'shadow/feature-test');
            expect(exists).toBe(false);
        });
    });
    
    describe('commitToShadowBranch', () => {
        it('should create commit with correct message and return hash', async () => {
            // Mock sequence: getCurrentBranch, add file1, add file2, commit, diff --stat
            mockExecAsync
                .mockResolvedValueOnce({ stdout: 'shadow/main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // add file1
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // add file2
                .mockResolvedValueOnce({ // commit
                    stdout: '[shadow/main a1b2c3d] Test commit message\n 2 files changed, 10 insertions(+)',
                    stderr: ''
                })
                .mockResolvedValueOnce({ // diff --stat
                    stdout: ' file1.js | 5 ++\n file2.js | 5 ++\n 2 files changed, 10 insertions(+)',
                    stderr: ''
                });
            
            const result = await manager.commitToShadowBranch(
                '/test/repo',
                'shadow/main',
                'Test commit message',
                ['file1.js', 'file2.js']
            );
            
            expect(result).toHaveProperty('commitHash');
            expect(result.commitHash).toBe('a1b2c3d');
            expect(result).toHaveProperty('filesChanged');
            expect(result.filesChanged).toBe(2);
        });
        
        it('should throw error if not on shadow branch', async () => {
            mockExecAsync.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
            
            await expect(
                manager.commitToShadowBranch(
                    '/test/repo',
                    'shadow/main',
                    'Test message',
                    ['file.js']
                )
            ).rejects.toThrow('Not on shadow branch');
        });
    });
    
    describe('switchToShadowBranch', () => {
        it('should stash changes if uncommitted changes exist', async () => {
            mockExecAsync
                .mockResolvedValueOnce({ stdout: 'M  file.txt\n', stderr: '' }) // hasUncommittedChanges
                .mockResolvedValueOnce({ stdout: 'Saved working directory', stderr: '' }) // git stash
                .mockResolvedValueOnce({ stdout: 'Switched to branch', stderr: '' }); // checkout
            
            const result = await manager.switchToShadowBranch('/test/repo', 'shadow/main');
            
            expect(result.stashed).toBe(true);
            expect(mockExecAsync).toHaveBeenCalledTimes(3);
        });
        
        it('should not stash if no uncommitted changes', async () => {
            mockExecAsync
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // hasUncommittedChanges (clean)
                .mockResolvedValueOnce({ stdout: 'Switched to branch', stderr: '' }); // checkout
            
            const result = await manager.switchToShadowBranch('/test/repo', 'shadow/main');
            
            expect(result.stashed).toBe(false);
            expect(mockExecAsync).toHaveBeenCalledTimes(2);
        });
    });
    
    describe('syncShadowBranch', () => {
        it('should sync shadow branch with original if behind', async () => {
            mockExecAsync
                .mockResolvedValueOnce({ stdout: '3\n', stderr: '' }) // rev-list count
                .mockResolvedValueOnce({ stdout: 'Fast-forward', stderr: '' }); // merge
            
            const result = await manager.syncShadowBranch(
                '/test/repo',
                'shadow/main',
                'main'
            );
            
            expect(result).toEqual({
                synced: true,
                commits: 3
            });
        });
        
        it('should not sync if already up to date', async () => {
            mockExecAsync.mockResolvedValueOnce({ stdout: '0\n', stderr: '' });
            
            const result = await manager.syncShadowBranch(
                '/test/repo',
                'shadow/main',
                'main'
            );
            
            expect(result).toEqual({
                synced: false,
                commits: 0
            });
        });
    });
    
    describe('listShadowBranches', () => {
        it('should return list of shadow branches with originals', async () => {
            mockExecAsync.mockResolvedValueOnce({ 
                stdout: '  shadow/main\n* shadow/feature-auth\n  shadow/feature-test\n',
                stderr: ''
            });
            
            const branches = await manager.listShadowBranches('/test/repo');
            
            expect(branches).toHaveLength(3);
            expect(branches).toContainEqual({
                shadow: 'shadow/main',
                original: 'main'
            });
            expect(branches).toContainEqual({
                shadow: 'shadow/feature-auth',
                original: 'feature-auth'
            });
        });
        
        it('should handle empty list', async () => {
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
            
            const branches = await manager.listShadowBranches('/test/repo');
            
            expect(branches).toEqual([]);
        });
    });
    
    describe('cleanupOrphanedShadowBranches', () => {
        it('should delete shadow branches without corresponding originals', async () => {
            mockExecAsync
                .mockResolvedValueOnce({ // listShadowBranches
                    stdout: '  shadow/main\n  shadow/orphaned\n',
                    stderr: ''
                })
                .mockResolvedValueOnce({ stdout: 'exists', stderr: '' }) // branchExists for main
                .mockRejectedValueOnce(new Error('not found')) // branchExists for orphaned
                .mockResolvedValueOnce({ stdout: 'Deleted branch', stderr: '' }); // delete orphaned
            
            const deleted = await manager.cleanupOrphanedShadowBranches('/test/repo');
            
            expect(deleted).toEqual(['shadow/orphaned']);
        });
        
        it('should handle no orphaned branches', async () => {
            mockExecAsync
                .mockResolvedValueOnce({ stdout: '  shadow/main\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: 'exists', stderr: '' });
            
            const deleted = await manager.cleanupOrphanedShadowBranches('/test/repo');
            
            expect(deleted).toEqual([]);
        });
    });
    
    describe('hasUncommittedChanges', () => {
        it('should return true if there are uncommitted changes', async () => {
            mockExecAsync.mockResolvedValueOnce({ stdout: 'M  file.txt\n', stderr: '' });
            
            const hasChanges = await manager.hasUncommittedChanges('/test/repo');
            
            expect(hasChanges).toBe(true);
        });
        
        it('should return false if working directory is clean', async () => {
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
            
            const hasChanges = await manager.hasUncommittedChanges('/test/repo');
            
            expect(hasChanges).toBe(false);
        });
        
        it('should handle git status errors gracefully', async () => {
            mockExecAsync.mockRejectedValueOnce(new Error('not a git repository'));
            
            const hasChanges = await manager.hasUncommittedChanges('/test/repo');
            
            expect(hasChanges).toBe(false);
        });
    });
});

describe('ShadowBranchManager Error Handling', () => {
    let manager;
    let mockExecAsync;
    
    beforeEach(() => {
        vi.clearAllMocks();
        mockExecAsync = vi.fn();
        promisify.mockReturnValue(mockExecAsync);
        manager = new ShadowBranchManager();
    });
    
    it('should handle repository not found', async () => {
        mockExecAsync.mockRejectedValue(new Error('fatal: not a git repository'));
        
        await expect(manager.ensureShadowBranch('/invalid/repo'))
            .rejects.toThrow('not a git repository');
    });
    
    it('should handle permission denied errors', async () => {
        mockExecAsync.mockRejectedValue(new Error('Permission denied'));
        
        await expect(manager.createBranch('/test/repo', 'shadow/test', 'test'))
            .rejects.toThrow('Permission denied');
    });
    
    it('should log errors through logger', async () => {
        const logSpy = vi.spyOn(manager.logger, 'error');
        
        mockExecAsync.mockRejectedValue(new Error('git error'));
        
        await expect(manager.ensureShadowBranch('/test/repo'))
            .rejects.toThrow();
        
        expect(logSpy).toHaveBeenCalled();
    });
});