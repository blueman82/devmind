/**
 * Unit tests for Shadow Branch Manager
 * Phase 2 Implementation - AI Memory App
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import ShadowBranchManager from '../shadow-commit/shadow-branch-manager.js';

// Mock child_process exec
vi.mock('child_process', () => ({
    exec: vi.fn((cmd, options, callback) => {
        // Handle both callback and promisified versions
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        if (callback) {
            callback(null, '', '');
        }
    })
}));

// Store mock implementation for dynamic control
let mockExecAsync = vi.fn();

// Helper to provide mock responses based on git commands
function getMockResponse(cmd, options) {
    // Get current branch
    if (cmd.includes('git symbolic-ref --short HEAD')) {
        return { stdout: 'main\n' };
    }
    
    // Check if branch exists
    if (cmd.includes('git show-ref --verify refs/heads/shadow/main')) {
        return { stdout: 'abc123def refs/heads/shadow/main\n' };
    }
    if (cmd.includes('git show-ref --verify refs/heads/shadow/feature-test')) {
        return { error: 'branch not found' };
    }
    
    // Create branch
    if (cmd.includes('git branch "shadow/')) {
        return { stdout: '' };
    }
    
    // Check uncommitted changes
    if (cmd.includes('git status --porcelain')) {
        if (options.testHasChanges) {
            return { stdout: 'M  file.txt\n' };
        }
        return { stdout: '' };
    }
    
    // Stash operations
    if (cmd.includes('git stash push')) {
        return { stdout: 'Saved working directory' };
    }
    if (cmd.includes('git stash pop')) {
        return { stdout: 'Dropped refs/stash@{0}' };
    }
    
    // Checkout operations
    if (cmd.includes('git checkout')) {
        return { stdout: `Switched to branch '${cmd.match(/"([^"]+)"/)?.[1]}'` };
    }
    
    // Add files
    if (cmd.includes('git add')) {
        return { stdout: '' };
    }
    
    // Commit
    if (cmd.includes('git commit -m')) {
        return { 
            stdout: '[shadow/main a1b2c3d] Test commit\n 1 file changed, 10 insertions(+)' 
        };
    }
    
    // Diff stats
    if (cmd.includes('git diff --stat')) {
        return { 
            stdout: ' file1.js | 10 ++\n file2.js | 5 +-\n 2 files changed, 12 insertions(+), 3 deletions(-)' 
        };
    }
    
    // List shadow branches
    if (cmd.includes('git branch --list "shadow/*"')) {
        return { stdout: '  shadow/main\n* shadow/feature-auth\n  shadow/feature-test\n' };
    }
    
    // Count commits behind
    if (cmd.includes('git rev-list')) {
        return { stdout: '3\n' };
    }
    
    // Merge branches
    if (cmd.includes('git merge')) {
        return { stdout: 'Fast-forward\n file.txt | 1 +\n' };
    }
    
    // Delete branch
    if (cmd.includes('git branch -D')) {
        return { stdout: 'Deleted branch shadow/orphaned' };
    }
    
    // Default response
    return { stdout: '' };
}

describe('ShadowBranchManager', () => {
    let manager;
    let execAsync;
    
    beforeEach(() => {
        // Reset all mocks before each test
        vi.clearAllMocks();
        manager = new ShadowBranchManager();
        execAsync = promisify(exec);
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
            // Mock branch doesn't exist
            const mockExec = vi.fn()
                .mockImplementationOnce(() => Promise.resolve({ stdout: 'feature-test\n' })) // getCurrentBranch
                .mockImplementationOnce(() => Promise.reject(new Error('branch not found'))) // branchExists
                .mockImplementationOnce(() => Promise.resolve({ stdout: '' })); // createBranch
            
            const customManager = new ShadowBranchManager();
            customManager.getCurrentBranch = vi.fn().mockResolvedValue('feature-test');
            customManager.branchExists = vi.fn().mockResolvedValue(false);
            customManager.createBranch = vi.fn().mockResolvedValue(undefined);
            
            const result = await customManager.ensureShadowBranch('/test/repo');
            
            expect(result).toEqual({
                shadowBranch: 'shadow/feature-test',
                originalBranch: 'feature-test',
                created: true
            });
            expect(customManager.createBranch).toHaveBeenCalledWith(
                '/test/repo',
                'shadow/feature-test',
                'feature-test'
            );
        });
        
        it('should return existing shadow branch without creating', async () => {
            const customManager = new ShadowBranchManager();
            customManager.getCurrentBranch = vi.fn().mockResolvedValue('main');
            customManager.branchExists = vi.fn().mockResolvedValue(true);
            customManager.createBranch = vi.fn();
            
            const result = await customManager.ensureShadowBranch('/test/repo');
            
            expect(result).toEqual({
                shadowBranch: 'shadow/main',
                originalBranch: 'main',
                created: false
            });
            expect(customManager.createBranch).not.toHaveBeenCalled();
        });
        
        it('should throw error if no active branch found', async () => {
            const customManager = new ShadowBranchManager();
            customManager.getCurrentBranch = vi.fn().mockResolvedValue(null);
            
            await expect(customManager.ensureShadowBranch('/test/repo'))
                .rejects.toThrow('No active branch found');
        });
    });
    
    describe('getCurrentBranch', () => {
        it('should return current branch name', async () => {
            const branch = await manager.getCurrentBranch('/test/repo');
            expect(branch).toBe('main');
        });
        
        it('should handle detached HEAD state', async () => {
            const customManager = new ShadowBranchManager();
            const mockExec = promisify(exec);
            
            // Override mock to simulate detached HEAD
            vi.mocked(mockExec).mockRejectedValueOnce(
                new Error('fatal: ref HEAD is not a symbolic ref')
            );
            
            const branch = await customManager.getCurrentBranch('/test/repo');
            expect(branch).toBeNull();
        });
    });
    
    describe('branchExists', () => {
        it('should return true if branch exists', async () => {
            const exists = await manager.branchExists('/test/repo', 'shadow/main');
            expect(exists).toBe(true);
        });
        
        it('should return false if branch does not exist', async () => {
            const exists = await manager.branchExists('/test/repo', 'shadow/feature-test');
            expect(exists).toBe(false);
        });
    });
    
    describe('commitToShadowBranch', () => {
        it('should create commit with correct message and return hash', async () => {
            const customManager = new ShadowBranchManager();
            customManager.getCurrentBranch = vi.fn().mockResolvedValue('shadow/main');
            
            const result = await customManager.commitToShadowBranch(
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
            const customManager = new ShadowBranchManager();
            customManager.getCurrentBranch = vi.fn().mockResolvedValue('main');
            
            await expect(
                customManager.commitToShadowBranch(
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
            const customManager = new ShadowBranchManager();
            customManager.hasUncommittedChanges = vi.fn().mockResolvedValue(true);
            
            const result = await customManager.switchToShadowBranch(
                '/test/repo',
                'shadow/main'
            );
            
            expect(result.stashed).toBe(true);
        });
        
        it('should not stash if no uncommitted changes', async () => {
            const customManager = new ShadowBranchManager();
            customManager.hasUncommittedChanges = vi.fn().mockResolvedValue(false);
            
            const result = await customManager.switchToShadowBranch(
                '/test/repo',
                'shadow/main'
            );
            
            expect(result.stashed).toBe(false);
        });
    });
    
    describe('syncShadowBranch', () => {
        it('should sync shadow branch with original if behind', async () => {
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
            // Mock no commits behind
            vi.mocked(promisify(exec)).mockImplementationOnce(() => 
                Promise.resolve({ stdout: '0\n', stderr: '' })
            );
            
            const customManager = new ShadowBranchManager();
            const result = await customManager.syncShadowBranch(
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
            // Mock empty response
            vi.mocked(promisify(exec)).mockImplementationOnce(() => 
                Promise.resolve({ stdout: '', stderr: '' })
            );
            
            const customManager = new ShadowBranchManager();
            const branches = await customManager.listShadowBranches('/test/repo');
            
            expect(branches).toEqual([]);
        });
    });
    
    describe('cleanupOrphanedShadowBranches', () => {
        it('should delete shadow branches without corresponding originals', async () => {
            const customManager = new ShadowBranchManager();
            
            customManager.listShadowBranches = vi.fn().mockResolvedValue([
                { shadow: 'shadow/main', original: 'main' },
                { shadow: 'shadow/orphaned', original: 'orphaned' }
            ]);
            
            customManager.branchExists = vi.fn()
                .mockResolvedValueOnce(true)  // main exists
                .mockResolvedValueOnce(false); // orphaned doesn't exist
            
            const deleted = await customManager.cleanupOrphanedShadowBranches('/test/repo');
            
            expect(deleted).toEqual(['shadow/orphaned']);
        });
        
        it('should handle no orphaned branches', async () => {
            const customManager = new ShadowBranchManager();
            
            customManager.listShadowBranches = vi.fn().mockResolvedValue([
                { shadow: 'shadow/main', original: 'main' }
            ]);
            
            customManager.branchExists = vi.fn().mockResolvedValue(true);
            
            const deleted = await customManager.cleanupOrphanedShadowBranches('/test/repo');
            
            expect(deleted).toEqual([]);
        });
    });
    
    describe('hasUncommittedChanges', () => {
        it('should return true if there are uncommitted changes', async () => {
            vi.mocked(promisify(exec)).mockImplementationOnce(() => 
                Promise.resolve({ stdout: 'M  file.txt\n', stderr: '' })
            );
            
            const customManager = new ShadowBranchManager();
            const hasChanges = await customManager.hasUncommittedChanges('/test/repo');
            
            expect(hasChanges).toBe(true);
        });
        
        it('should return false if working directory is clean', async () => {
            vi.mocked(promisify(exec)).mockImplementationOnce(() => 
                Promise.resolve({ stdout: '', stderr: '' })
            );
            
            const customManager = new ShadowBranchManager();
            const hasChanges = await customManager.hasUncommittedChanges('/test/repo');
            
            expect(hasChanges).toBe(false);
        });
        
        it('should handle git status errors gracefully', async () => {
            vi.mocked(promisify(exec)).mockRejectedValueOnce(
                new Error('not a git repository')
            );
            
            const customManager = new ShadowBranchManager();
            const hasChanges = await customManager.hasUncommittedChanges('/test/repo');
            
            expect(hasChanges).toBe(false);
        });
    });
});

describe('ShadowBranchManager Error Handling', () => {
    let manager;
    
    beforeEach(() => {
        vi.clearAllMocks();
        manager = new ShadowBranchManager();
    });
    
    it('should handle repository not found', async () => {
        vi.mocked(promisify(exec)).mockRejectedValue(
            new Error('fatal: not a git repository')
        );
        
        await expect(manager.ensureShadowBranch('/invalid/repo'))
            .rejects.toThrow('not a git repository');
    });
    
    it('should handle permission denied errors', async () => {
        vi.mocked(promisify(exec)).mockRejectedValue(
            new Error('Permission denied')
        );
        
        await expect(manager.createBranch('/test/repo', 'shadow/test', 'test'))
            .rejects.toThrow('Permission denied');
    });
    
    it('should log errors through logger', async () => {
        const logSpy = vi.spyOn(manager.logger, 'error');
        
        manager.getCurrentBranch = vi.fn().mockRejectedValue(
            new Error('git error')
        );
        
        await expect(manager.ensureShadowBranch('/test/repo'))
            .rejects.toThrow('git error');
        
        expect(logSpy).toHaveBeenCalled();
    });
});