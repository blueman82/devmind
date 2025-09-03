/**
 * Shadow Branch Manager
 * Handles creation and management of shadow branches for auto-commit functionality
 * Phase 2 Implementation - AI Memory App
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../utils/logger.js';

const execAsync = promisify(exec);

class ShadowBranchManager {
    constructor(options = {}) {
        this.logger = createLogger('ShadowBranchManager');
        this.shadowPrefix = options.shadowPrefix || 'shadow/';
        this.repositories = new Map(); // Cache repository states
    }

    /**
     * Get or create shadow branch for a repository
     * @param {string} repoPath - Path to the git repository
     * @returns {Promise<{shadowBranch: string, originalBranch: string, created: boolean}>}
     */
    async ensureShadowBranch(repoPath) {
        try {
            // Get current branch
            const originalBranch = await this.getCurrentBranch(repoPath);
            if (!originalBranch) {
                throw new Error(`No active branch found in ${repoPath}`);
            }

            // Construct shadow branch name
            const shadowBranch = `${this.shadowPrefix}${originalBranch}`;
            
            // Check if shadow branch exists
            const branchExists = await this.branchExists(repoPath, shadowBranch);
            
            if (!branchExists) {
                // Create shadow branch from current branch
                await this.createBranch(repoPath, shadowBranch, originalBranch);
                this.logger.info(`Created shadow branch: ${shadowBranch} from ${originalBranch}`);
                
                return {
                    shadowBranch,
                    originalBranch,
                    created: true
                };
            }

            // Shadow branch already exists
            return {
                shadowBranch,
                originalBranch,
                created: false
            };
        } catch (error) {
            this.logger.error('Failed to ensure shadow branch', { 
                error: error.message, 
                repoPath 
            });
            throw error;
        }
    }

    /**
     * Get current branch name
     * @param {string} repoPath - Path to the git repository
     * @returns {Promise<string|null>} Current branch name or null if detached
     */
    async getCurrentBranch(repoPath) {
        try {
            const { stdout } = await execAsync('git symbolic-ref --short HEAD', {
                cwd: repoPath
            });
            return stdout.trim();
        } catch (error) {
            // Handle detached HEAD state
            if (error.message.includes('not a symbolic ref')) {
                this.logger.warn('Repository in detached HEAD state', { repoPath });
                return null;
            }
            throw error;
        }
    }

    /**
     * Check if branch exists
     * @param {string} repoPath - Path to the git repository
     * @param {string} branchName - Name of the branch to check
     * @returns {Promise<boolean>}
     */
    async branchExists(repoPath, branchName) {
        try {
            const { stdout } = await execAsync(
                `git show-ref --verify refs/heads/${branchName}`,
                { cwd: repoPath }
            );
            return stdout.length > 0;
        } catch {
            // Branch doesn't exist if command fails
            return false;
        }
    }

    /**
     * Create a new branch
     * @param {string} repoPath - Path to the git repository
     * @param {string} newBranch - Name of the new branch
     * @param {string} baseBranch - Base branch to create from
     * @returns {Promise<void>}
     */
    async createBranch(repoPath, newBranch, baseBranch) {
        await execAsync(
            `git branch "${newBranch}" "${baseBranch}"`,
            { cwd: repoPath }
        );
    }

    /**
     * Check if repository has uncommitted changes
     * @param {string} repoPath - Path to the git repository
     * @returns {Promise<boolean>}
     */
    async hasUncommittedChanges(repoPath) {
        try {
            const { stdout } = await execAsync('git status --porcelain', {
                cwd: repoPath
            });
            return stdout.trim().length > 0;
        } catch (error) {
            this.logger.warn('Failed to check for uncommitted changes', { 
                error: error.message, 
                repoPath 
            });
            return false;
        }
    }

    /**
     * Switch to shadow branch temporarily for committing
     * @param {string} repoPath - Path to the git repository
     * @param {string} shadowBranch - Shadow branch name
     * @returns {Promise<void>}
     */
    async switchToShadowBranch(repoPath, shadowBranch) {
        // Stash any uncommitted changes first
        const hasChanges = await this.hasUncommittedChanges(repoPath);
        let stashed = false;
        
        if (hasChanges) {
            await execAsync('git stash push -m "Auto-commit: temporary stash"', {
                cwd: repoPath
            });
            stashed = true;
        }

        // Switch to shadow branch
        await execAsync(`git checkout "${shadowBranch}"`, {
            cwd: repoPath
        });

        return { stashed };
    }

    /**
     * Switch back to original branch
     * @param {string} repoPath - Path to the git repository
     * @param {string} originalBranch - Original branch name
     * @param {boolean} wasStashed - Whether changes were stashed
     * @returns {Promise<void>}
     */
    async switchBackToOriginalBranch(repoPath, originalBranch, wasStashed) {
        // Switch back to original branch
        await execAsync(`git checkout "${originalBranch}"`, {
            cwd: repoPath
        });

        // Restore stashed changes if any
        if (wasStashed) {
            try {
                await execAsync('git stash pop', { cwd: repoPath });
            } catch (error) {
                this.logger.warn('Failed to restore stashed changes', {
                    error: error.message,
                    repoPath
                });
            }
        }
    }

    /**
     * Commit changes to shadow branch
     * @param {string} repoPath - Path to the git repository
     * @param {string} shadowBranch - Shadow branch name
     * @param {string} message - Commit message
     * @param {Array<string>} files - Files to commit
     * @returns {Promise<{commitHash: string, filesChanged: number}>}
     */
    async commitToShadowBranch(repoPath, shadowBranch, message, files) {
        try {
            // Ensure we're on the shadow branch
            const currentBranch = await this.getCurrentBranch(repoPath);
            if (currentBranch !== shadowBranch) {
                throw new Error(`Not on shadow branch. Current: ${currentBranch}, Expected: ${shadowBranch}`);
            }

            // Add specified files
            for (const file of files) {
                await execAsync(`git add "${file}"`, { cwd: repoPath });
            }

            // Create commit
            const { stdout: commitOutput } = await execAsync(
                `git commit -m "${message}"`,
                { cwd: repoPath }
            );

            // Extract commit hash
            const hashMatch = commitOutput.match(/\[[\w/]+\s+([a-f0-9]+)\]/);
            const commitHash = hashMatch ? hashMatch[1] : null;

            // Get commit stats
            const { stdout: statsOutput } = await execAsync(
                `git diff --stat HEAD~1 HEAD`,
                { cwd: repoPath }
            );

            const filesChanged = (statsOutput.match(/\n/g) || []).length - 1;

            return {
                commitHash,
                filesChanged,
                message: commitOutput.trim()
            };
        } catch (error) {
            this.logger.error('Failed to commit to shadow branch', {
                error: error.message,
                repoPath,
                shadowBranch
            });
            throw error;
        }
    }


    /**
     * Sync shadow branch with original branch
     * @param {string} repoPath - Path to the git repository
     * @param {string} shadowBranch - Shadow branch name
     * @param {string} originalBranch - Original branch name
     * @returns {Promise<{synced: boolean, commits: number}>}
     */
    async syncShadowBranch(repoPath, shadowBranch, originalBranch) {
        try {
            // Get commits that are in original but not in shadow
            const { stdout } = await execAsync(
                `git rev-list ${shadowBranch}..${originalBranch} --count`,
                { cwd: repoPath }
            );

            const behindCount = parseInt(stdout.trim()) || 0;
            
            if (behindCount > 0) {
                // Merge original into shadow (fast-forward if possible)
                await execAsync(
                    `git checkout "${shadowBranch}" && git merge "${originalBranch}" --no-edit`,
                    { cwd: repoPath }
                );

                this.logger.info(`Synced shadow branch with ${behindCount} commits from ${originalBranch}`);

                return {
                    synced: true,
                    commits: behindCount
                };
            }

            return {
                synced: false,
                commits: 0
            };
        } catch (error) {
            this.logger.error('Failed to sync shadow branch', {
                error: error.message,
                repoPath,
                shadowBranch,
                originalBranch
            });
            throw error;
        }
    }

    /**
     * List all shadow branches in repository
     * @param {string} repoPath - Path to the git repository
     * @returns {Promise<Array<{shadow: string, original: string}>>}
     */
    async listShadowBranches(repoPath) {
        try {
            const { stdout } = await execAsync(
                `git branch --list "${this.shadowPrefix}*"`,
                { cwd: repoPath }
            );

            const branches = stdout
                .split('\n')
                .map(line => line.trim().replace('* ', ''))
                .filter(branch => branch.length > 0)
                .map(shadow => ({
                    shadow,
                    original: shadow.replace(this.shadowPrefix, '')
                }));

            return branches;
        } catch (error) {
            this.logger.error('Failed to list shadow branches', {
                error: error.message,
                repoPath
            });
            return [];
        }
    }

    /**
     * Clean up old shadow branches that no longer have corresponding original branches
     * @param {string} repoPath - Path to the git repository
     * @returns {Promise<Array<string>>} Deleted branch names
     */
    async cleanupOrphanedShadowBranches(repoPath) {
        try {
            const shadowBranches = await this.listShadowBranches(repoPath);
            const deleted = [];

            for (const { shadow, original } of shadowBranches) {
                const originalExists = await this.branchExists(repoPath, original);
                
                if (!originalExists) {
                    await execAsync(`git branch -D "${shadow}"`, { cwd: repoPath });
                    deleted.push(shadow);
                    this.logger.info(`Deleted orphaned shadow branch: ${shadow}`);
                }
            }

            return deleted;
        } catch (error) {
            this.logger.error('Failed to cleanup shadow branches', {
                error: error.message,
                repoPath
            });
            return [];
        }
    }
}

export default ShadowBranchManager;