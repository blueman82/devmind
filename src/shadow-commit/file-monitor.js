/**
 * File System Monitor
 * Uses chokidar to monitor file changes and trigger shadow commits
 * Phase 2 Implementation - AI Memory App
 */

import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs/promises';
import { createLogger } from '../utils/logger.js';
import { minimatch } from 'minimatch';
import ShadowBranchManager from './shadow-branch-manager.js';
import ConversationCorrelator from './conversation-correlator.js';

class FileMonitor {
    constructor(options = {}) {
        this.logger = createLogger('FileMonitor');
        this.shadowManager = new ShadowBranchManager();
        this.correlator = new ConversationCorrelator();
        
        // Configuration
        this.config = {
            throttleMs: options.throttleMs || 2000,
            maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB default
            maxDepth: options.maxDepth || 5,
            defaultExclusions: [
                'node_modules/**',
                'dist/**',
                '*.lock',
                '.env',
                '.env.*',
                '**/.git/**',
                '**/build/**',
                '**/coverage/**',
                '**/.cache/**',
                '*.log',
                '*.tmp',
                '*.swp',
                '*.swo',
                '.DS_Store'
            ],
            sensitivePatterns: [
                /api[_-]?key/i,
                /secret[_-]?key/i,
                /password/i,
                /token/i,
                /bearer\s+[a-z0-9\-._~\+\/]+=*/i,
                /aws[_-]?access[_-]?key/i,
                /aws[_-]?secret/i
            ],
            ...options
        };
        
        // State management
        this.monitors = new Map(); // repo path -> FSEvents watcher
        this.lastCommitTime = new Map(); // file path -> timestamp
        this.activeRepositories = new Map(); // repo path -> config
    }

    /**
     * Start monitoring a repository
     * @param {string} repoPath - Path to the git repository
     * @param {Object} repoConfig - Repository-specific configuration
     * @returns {Promise<void>}
     */
    async startMonitoring(repoPath, repoConfig = {}) {
        try {
            // Validate repository
            const stats = await fs.stat(path.join(repoPath, '.git'));
            if (!stats.isDirectory()) {
                throw new Error(`${repoPath} is not a git repository`);
            }
            
            // Stop existing monitor if any
            if (this.monitors.has(repoPath)) {
                await this.stopMonitoring(repoPath);
            }
            
            // Merge configurations
            const config = {
                ...this.config,
                ...repoConfig,
                exclusions: [
                    ...this.config.defaultExclusions,
                    ...(repoConfig.exclusions || [])
                ]
            };
            
            // Create FSEvents watcher
            const watcher = FSEvents(repoPath);
            
            // Set up event handlers
            watcher.on('change', this.handleFileChange.bind(this, repoPath, config));
            watcher.on('error', error => {
                this.logger.error('FSEvents error', { error: error.message, repoPath });
            });
            
            // Start watching
            await watcher.start();
            
            // Store references
            this.monitors.set(repoPath, watcher);
            this.activeRepositories.set(repoPath, config);
            
            // Ensure shadow branch exists
            await this.shadowManager.ensureShadowBranch(repoPath);
            
            this.logger.info('Started monitoring repository', { repoPath });
        } catch (error) {
            this.logger.error('Failed to start monitoring', { 
                error: error.message, 
                repoPath 
            });
            throw error;
        }
    }

    /**
     * Stop monitoring a repository
     * @param {string} repoPath - Path to the git repository
     * @returns {Promise<void>}
     */
    async stopMonitoring(repoPath) {
        const watcher = this.monitors.get(repoPath);
        if (watcher) {
            await watcher.stop();
            this.monitors.delete(repoPath);
            this.activeRepositories.delete(repoPath);
            this.logger.info('Stopped monitoring repository', { repoPath });
        }
    }

    /**
     * Handle file change event
     * @param {string} repoPath - Repository path
     * @param {Object} config - Repository configuration
     * @param {string} filePath - Changed file path
     * @param {Object} flags - FSEvents flags
     * @returns {Promise<void>}
     */
    async handleFileChange(repoPath, config, filePath, flags) {
        try {
            // Check if it's a file (not directory)
            if (flags.isDirectory) return;
            
            // Get relative path
            const relativePath = path.relative(repoPath, filePath);
            
            // Check exclusions
            if (this.shouldExclude(relativePath, config.exclusions)) {
                this.logger.debug('File excluded from auto-commit', { filePath: relativePath });
                return;
            }
            
            // Check throttling
            if (!this.shouldCommit(filePath, config.throttleMs)) {
                this.logger.debug('Commit throttled', { filePath: relativePath });
                return;
            }
            
            // Check file size
            const fileStats = await fs.stat(filePath);
            if (fileStats.size > config.maxFileSize) {
                this.logger.warn('File exceeds size limit', {
                    filePath: relativePath,
                    size: fileStats.size,
                    limit: config.maxFileSize
                });
                return;
            }
            
            // Check for sensitive content
            if (await this.containsSensitiveContent(filePath, config.sensitivePatterns)) {
                this.logger.warn('Sensitive content detected', { filePath: relativePath });
                return;
            }
            
            // Check if file is tracked by git
            const isTracked = await this.isFileTracked(repoPath, relativePath);
            if (!isTracked && !flags.isCreated) {
                this.logger.debug('File not tracked by git', { filePath: relativePath });
                return;
            }
            
            // Create shadow commit
            await this.createShadowCommit(repoPath, relativePath, config);
            
            // Update last commit time
            this.lastCommitTime.set(filePath, Date.now());
            
        } catch (error) {
            this.logger.error('Failed to handle file change', {
                error: error.message,
                filePath,
                repoPath
            });
        }
    }

    /**
     * Check if file should be excluded
     * @param {string} filePath - Relative file path
     * @param {Array<string>} exclusions - Exclusion patterns
     * @returns {boolean}
     */
    shouldExclude(filePath, exclusions) {
        return exclusions.some(pattern => minimatch(filePath, pattern));
    }

    /**
     * Check if enough time has passed for next commit
     * @param {string} filePath - File path
     * @param {number} throttleMs - Throttle in milliseconds
     * @returns {boolean}
     */
    shouldCommit(filePath, throttleMs) {
        const lastTime = this.lastCommitTime.get(filePath) || 0;
        return Date.now() - lastTime >= throttleMs;
    }

    /**
     * Check if file contains sensitive content
     * @param {string} filePath - File path
     * @param {Array<RegExp>} patterns - Sensitive patterns
     * @returns {Promise<boolean>}
     */
    async containsSensitiveContent(filePath, patterns) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const firstKb = content.substring(0, 1024); // Check first 1KB
            
            return patterns.some(pattern => pattern.test(firstKb));
        } catch (error) {
            // If can't read file, assume it's safe (binary files etc)
            return false;
        }
    }

    /**
     * Check if file is tracked by git
     * @param {string} repoPath - Repository path
     * @param {string} filePath - Relative file path
     * @returns {Promise<boolean>}
     */
    async isFileTracked(repoPath, filePath) {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        try {
            await execAsync(`git ls-files --error-unmatch "${filePath}"`, {
                cwd: repoPath
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Create a shadow commit for the file change
     * @param {string} repoPath - Repository path
     * @param {string} filePath - Relative file path
     * @param {Object} config - Repository configuration
     * @returns {Promise<void>}
     */
    async createShadowCommit(repoPath, filePath, config) {
        try {
            // Get current branch info
            const { shadowBranch, originalBranch } = await this.shadowManager.ensureShadowBranch(repoPath);
            
            // Check for conversation context
            const correlation = await this.correlator.findConversationContext(repoPath, filePath);
            
            // Generate commit message
            const message = await this.generateCommitMessage(
                filePath, 
                repoPath,
                shadowBranch,
                correlation
            );
            
            // Temporarily switch to shadow branch
            const currentBranch = await this.shadowManager.getCurrentBranch(repoPath);
            const needsSwitch = currentBranch !== shadowBranch;
            
            let stashInfo = null;
            if (needsSwitch) {
                stashInfo = await this.shadowManager.switchToShadowBranch(repoPath, shadowBranch);
            }
            
            try {
                // Commit the file
                const commitResult = await this.shadowManager.commitToShadowBranch(
                    repoPath,
                    shadowBranch,
                    message,
                    [filePath]
                );
                
                this.logger.info('Shadow commit created', {
                    commitHash: commitResult.commitHash,
                    filePath,
                    shadowBranch,
                    hasContext: !!correlation
                });
                
                // Store correlation if found
                if (correlation) {
                    await this.correlator.saveCorrelation(
                        correlation.sessionId,
                        commitResult.commitHash,
                        repoPath,
                        correlation.confidence
                    );
                }
            } finally {
                // Switch back if needed
                if (needsSwitch) {
                    await this.shadowManager.switchBackToOriginalBranch(
                        repoPath,
                        originalBranch,
                        stashInfo.stashed
                    );
                }
            }
            
        } catch (error) {
            this.logger.error('Failed to create shadow commit', {
                error: error.message,
                filePath,
                repoPath
            });
            throw error;
        }
    }

    /**
     * Generate commit message
     * @param {string} filePath - File path
     * @param {string} repoPath - Repository path
     * @param {string} shadowBranch - Shadow branch name
     * @param {Object} correlation - Conversation correlation data
     * @returns {Promise<string>}
     */
    async generateCommitMessage(filePath, repoPath, shadowBranch, correlation) {
        const fileName = path.basename(filePath);
        const timestamp = new Date().toISOString();
        
        if (correlation && correlation.confidence > 0.8) {
            // Rich message with conversation context
            return [
                `Auto-save: ${fileName} - ${shadowBranch}`,
                '',
                correlation.description || 'File modified during Claude Code session',
                '',
                `Session: ${correlation.sessionId}`,
                `Confidence: ${Math.round(correlation.confidence * 100)}%`,
                `Timestamp: ${timestamp}`
            ].join('\n');
        } else {
            // Basic diff-based message
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            
            try {
                const { stdout } = await execAsync(
                    `git diff --stat "${filePath}"`,
                    { cwd: repoPath }
                );
                
                const stats = stdout.trim().split('\n').pop() || 'changes';
                
                return [
                    `Auto-save: ${fileName} - ${shadowBranch}`,
                    '',
                    `Automatic save of file modifications`,
                    `Changes: ${stats}`,
                    `Timestamp: ${timestamp}`
                ].join('\n');
            } catch (error) {
                return `Auto-save: ${fileName} - ${shadowBranch}\n\nTimestamp: ${timestamp}`;
            }
        }
    }

    /**
     * Get monitoring statistics
     * @returns {Object}
     */
    getStatistics() {
        return {
            activeRepositories: this.activeRepositories.size,
            repositories: Array.from(this.activeRepositories.keys()),
            totalCommits: Array.from(this.lastCommitTime.values()).length
        };
    }

    /**
     * Stop all monitors
     * @returns {Promise<void>}
     */
    async stopAll() {
        const repos = Array.from(this.monitors.keys());
        await Promise.all(repos.map(repo => this.stopMonitoring(repo)));
        this.logger.info('Stopped all repository monitors');
    }
}

export default FileMonitor;