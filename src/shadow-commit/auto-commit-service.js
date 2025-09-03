/**
 * Auto-Commit Service
 * Main orchestrator for Phase 2 auto-commit functionality
 * Integrates file monitoring, shadow branches, and conversation correlation
 */

import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { createLogger } from '../utils/logger.js';
import DatabaseManager from '../database/database-manager.js';
import ShadowBranchManager from './shadow-branch-manager.js';
import FileMonitor from './file-monitor.js';
import ConversationCorrelator from './conversation-correlator.js';
import ErrorHandler from './error-handler.js';
import PQueue from 'p-queue';
import PerformanceMonitor from './performance-monitor.js';

class AutoCommitService {
    constructor(options = {}) {
        this.logger = createLogger('AutoCommitService');
        this.db = new DatabaseManager();
        this.db.initialize(); // Ensure database is initialized
        
        // Initialize error handler with notification callback
        this.errorHandler = new ErrorHandler({
            maxRetries: options.maxRetries || 3,
            baseDelay: options.baseDelay || 1000,
            maxDelay: options.maxDelay || 30000,
            notificationCallback: this.sendErrorNotification.bind(this)
        });
        
        // Initialize performance monitoring
        this.performanceMonitor = new PerformanceMonitor({
            sampleInterval: options.performanceSampleInterval || 1000,
            maxHistorySize: options.performanceHistorySize || 100
        });
        
        // Initialize operation queues with concurrency limits
        this.gitOperationQueue = new PQueue({ 
            concurrency: options.gitConcurrency || 2,
            interval: 1000,
            intervalCap: options.gitOperationsPerSecond || 10
        });
        
        this.fileOperationQueue = new PQueue({
            concurrency: options.fileConcurrency || 5,
            interval: 100,
            intervalCap: options.fileOperationsPerInterval || 20
        });
        
        // Initialize sub-modules
        this.shadowManager = new ShadowBranchManager(options.shadow);
        this.fileMonitor = new FileMonitor(options.monitor);
        this.correlator = new ConversationCorrelator(options.correlator);
        
        // Service configuration
        this.config = {
            enabled: options.enabled !== false,
            autoDetectRepos: options.autoDetectRepos !== false,
            claudeProjectsPath: options.claudeProjectsPath || path.join(process.env.HOME, '.claude', 'projects'),
            userReposPath: options.userReposPath || process.env.HOME,
            maxRepoDepth: options.maxRepoDepth || 3,
            ...options
        };
        
        // State management
        this.activeRepositories = new Map();
        this.isRunning = false;
        this.statistics = {
            startTime: null,
            totalCommits: 0,
            correlatedCommits: 0,
            repositories: 0,
            errors: 0
        };
    }

    /**
     * Start the auto-commit service
     * @returns {Promise<void>}
     */
    async start() {
        if (this.isRunning) {
            this.logger.warn('Service already running');
            return;
        }
        
        try {
            this.logger.info('Starting auto-commit service');
            this.isRunning = true;
            this.statistics.startTime = Date.now();
            
            // Initialize database connection
            await this.db.initialize();
            
            // Auto-detect repositories if enabled
            if (this.config.autoDetectRepos) {
                await this.detectAndAddRepositories();
            }
            
            // Start monitoring all configured repositories
            for (const [repoPath, config] of this.activeRepositories.entries()) {
                await this.startMonitoringRepository(repoPath, config);
            }
            
            this.logger.info('Auto-commit service started', {
                repositories: this.activeRepositories.size,
                autoDetect: this.config.autoDetectRepos
            });
        } catch (error) {
            this.logger.error('Failed to start service', { error: error.message });
            this.isRunning = false;
            throw error;
        }
    }

    /**
     * Stop the auto-commit service
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }
        
        this.logger.info('Stopping auto-commit service');
        
        // Stop all file monitors
        await this.fileMonitor.stopAll();
        
        // Save statistics
        await this.saveStatistics();
        
        this.isRunning = false;
        this.logger.info('Auto-commit service stopped', this.getStatistics());
    }

    /**
     * Add a repository to monitor
     * @param {string} repoPath - Path to the git repository
     * @param {Object} config - Repository-specific configuration
     * @returns {Promise<void>}
     */
    async addRepository(repoPath, config = {}) {
        try {
            // Validate it's a git repository
            const gitPath = path.join(repoPath, '.git');
            const stats = await fs.stat(gitPath);
            if (!stats.isDirectory()) {
                throw new Error('Not a git repository');
            }
            
            // Check if already monitoring
            if (this.activeRepositories.has(repoPath)) {
                this.logger.info('Repository already being monitored', { repoPath });
                return;
            }
            
            // Load repository settings from database
            const settings = await this.loadRepositorySettings(repoPath);
            const mergedConfig = { ...settings, ...config };
            
            // Store configuration
            this.activeRepositories.set(repoPath, mergedConfig);
            
            // Save to database
            await this.saveRepositorySettings(repoPath, mergedConfig);
            
            // Start monitoring if service is running
            if (this.isRunning) {
                await this.startMonitoringRepository(repoPath, mergedConfig);
            }
            
            this.statistics.repositories++;
            this.logger.info('Added repository', { repoPath, config: mergedConfig });
        } catch (error) {
            this.logger.error('Failed to add repository', { 
                error: error.message, 
                repoPath 
            });
            throw error;
        }
    }

    /**
     * Remove a repository from monitoring
     * @param {string} repoPath - Path to the git repository
     * @returns {Promise<void>}
     */
    async removeRepository(repoPath) {
        if (!this.activeRepositories.has(repoPath)) {
            return;
        }
        
        // Stop monitoring
        await this.fileMonitor.stopMonitoring(repoPath);
        
        // Remove from active list
        this.activeRepositories.delete(repoPath);
        
        // Update database
        await this.updateRepositoryStatus(repoPath, false);
        
        this.statistics.repositories--;
        this.logger.info('Removed repository', { repoPath });
    }

    /**
     * Start monitoring a specific repository
     * @param {string} repoPath - Repository path
     * @param {Object} config - Repository configuration
     * @returns {Promise<void>}
     */
    async startMonitoringRepository(repoPath, config) {
        try {
            // Ensure shadow branch exists
            const { shadowBranch, originalBranch } = await this.shadowManager.ensureShadowBranch(repoPath);
            
            this.logger.info('Monitoring repository', {
                repoPath,
                originalBranch,
                shadowBranch
            });
            
            // Set up custom file change handler
            const originalConfig = { ...config };
            config.onFileChange = async (filePath, flags) => {
                await this.handleFileChange(repoPath, filePath, flags, originalConfig);
            };
            
            // Start file monitoring
            await this.fileMonitor.startMonitoring(repoPath, config);
            
        } catch (error) {
            this.logger.error('Failed to start monitoring repository', {
                error: error.message,
                repoPath
            });
            this.statistics.errors++;
        }
    }

    /**
     * Handle file change event with custom logic
     * @param {string} repoPath - Repository path
     * @param {string} filePath - Changed file path
     * @param {Object} flags - Change flags
     * @param {Object} config - Repository configuration
     * @returns {Promise<void>}
     */
    async handleFileChange(repoPath, filePath, flags, config) {
        // Queue the file change operation to prevent overwhelming the system
        return this.fileOperationQueue.add(async () => {
            const perfId = `file-change-${Date.now()}`;
            this.performanceMonitor.startOperation(perfId, {
                type: 'file-change',
                repository: repoPath,
                file: filePath
            });
            
            try {
                const relativePath = path.relative(repoPath, filePath);
                
                // Check for conversation correlation
                const correlation = await this.correlator.findConversationContext(repoPath, filePath);
                
                // Queue git operations
                await this.gitOperationQueue.add(async () => {
                    const gitPerfId = `git-op-${Date.now()}`;
                    this.performanceMonitor.startOperation(gitPerfId, {
                        type: 'commit',
                        repository: repoPath
                    });
                    
                    try {
                        // Get shadow branch info
                        const { shadowBranch, originalBranch } = await this.shadowManager.ensureShadowBranch(repoPath);
                        
                        // Generate commit message
                        const message = this.generateCommitMessage(relativePath, shadowBranch, correlation);
                        
                        // Create shadow commit
                        await this.createShadowCommit(repoPath, relativePath, shadowBranch, originalBranch, message, correlation);
                        
                        this.performanceMonitor.endOperation(gitPerfId, { success: true });
                    } catch (error) {
                        this.performanceMonitor.endOperation(gitPerfId, { error: error.message });
                        throw error;
                    }
                });
                
                // Update statistics
                this.statistics.totalCommits++;
                if (correlation) {
                    this.statistics.correlatedCommits++;
                }
                
                // Notify if configured
                if (config.notifications) {
                    await this.sendNotification(repoPath, relativePath, filePath, correlation);
                }
                
                this.performanceMonitor.endOperation(perfId, { success: true });
            } catch (error) {
                this.performanceMonitor.endOperation(perfId, { error: error.message });
                this.logger.error('Failed to handle file change', {
                    error: error.message,
                    filePath,
                    repoPath
                });
                this.statistics.errors++;
                throw error;
            }
        });
    }

    /**
     * Create a shadow commit
     * @param {string} repoPath - Repository path
     * @param {string} filePath - File path
     * @param {string} shadowBranch - Shadow branch name
     * @param {string} originalBranch - Original branch name
     * @param {string} message - Commit message
     * @param {Object} correlation - Conversation correlation
     * @returns {Promise<void>}
     */
    async createShadowCommit(repoPath, filePath, shadowBranch, originalBranch, message, correlation) {
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
            
            // Save to database
            await this.saveCommitToDatabase(
                commitResult.commitHash,
                shadowBranch,
                originalBranch,
                repoPath,
                filePath,
                message,
                correlation
            );
            
            this.logger.info('Shadow commit created', {
                commitHash: commitResult.commitHash,
                filePath,
                shadowBranch,
                hasCorrelation: !!correlation
            });
            
        } finally {
            if (needsSwitch) {
                await this.shadowManager.switchBackToOriginalBranch(
                    repoPath,
                    originalBranch,
                    stashInfo.stashed
                );
            }
        }
    }

    /**
     * Generate commit message
     * @param {string} filePath - File path
     * @param {string} shadowBranch - Shadow branch name
     * @param {Object} correlation - Conversation correlation
     * @returns {string}
     */
    generateCommitMessage(filePath, shadowBranch, correlation) {
        const timestamp = new Date().toISOString();
        const fileName = path.basename(filePath);
        
        if (correlation && correlation.confidence > 0.8) {
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
            return [
                `Auto-save: ${fileName} - ${shadowBranch}`,
                '',
                'Automatic save of file modifications',
                `Timestamp: ${timestamp}`
            ].join('\n');
        }
    }

    /**
     * Auto-detect repositories
     * @returns {Promise<void>}
     */
    async detectAndAddRepositories() {
        const detectedRepos = new Set();
        
        try {
            // Check Claude projects for active repositories
            if (this.config.claudeProjectsPath) {
                const claudeRepos = await this.detectClaudeProjectRepos();
                claudeRepos.forEach(repo => detectedRepos.add(repo));
            }
            
            // Check user-defined paths for git repositories
            if (this.config.userReposPath) {
                const userRepos = await this.detectUserRepos();
                userRepos.forEach(repo => detectedRepos.add(repo));
            }
            
            // Add all detected repositories
            for (const repoPath of detectedRepos) {
                await this.addRepository(repoPath, { autoDetected: true });
            }
            
            this.logger.info('Auto-detected repositories', {
                count: detectedRepos.size,
                repositories: Array.from(detectedRepos)
            });
        } catch (error) {
            this.logger.error('Failed to auto-detect repositories', {
                error: error.message
            });
        }
    }

    /**
     * Detect repositories from Claude projects
     * @returns {Promise<Array<string>>}
     */
    async detectClaudeProjectRepos() {
        const repos = [];
        
        try {
            const projects = await fs.readdir(this.config.claudeProjectsPath);
            
            for (const project of projects) {
                const projectPath = path.join(this.config.claudeProjectsPath, project);
                const stats = await fs.stat(projectPath);
                
                if (stats.isDirectory()) {
                    // Check if it has a git directory
                    try {
                        const gitPath = path.join(projectPath, '.git');
                        await fs.access(gitPath);
                        repos.push(projectPath);
                    } catch {
                        // Not a git repo, skip
                    }
                }
            }
        } catch (error) {
            this.logger.debug('Failed to detect Claude project repos', {
                error: error.message
            });
        }
        
        return repos;
    }

    /**
     * Detect user repositories
     * @returns {Promise<Array<string>>}
     */
    async detectUserRepos() {
        const repos = [];
        
        const searchPaths = [
            path.join(this.config.userReposPath, 'Documents', 'Github'),
            path.join(this.config.userReposPath, 'Documents', 'Projects'),
            path.join(this.config.userReposPath, 'Projects'),
            path.join(this.config.userReposPath, 'Code')
        ];
        
        for (const searchPath of searchPaths) {
            try {
                const foundRepos = await this.findGitRepos(searchPath, this.config.maxRepoDepth);
                repos.push(...foundRepos);
            } catch {
                // Path doesn't exist, skip
            }
        }
        
        return repos;
    }

    /**
     * Recursively find git repositories
     * @param {string} dirPath - Directory to search
     * @param {number} maxDepth - Maximum depth to search
     * @param {number} currentDepth - Current depth
     * @returns {Promise<Array<string>>}
     */
    async findGitRepos(dirPath, maxDepth, currentDepth = 0) {
        const repos = [];
        
        if (currentDepth >= maxDepth) {
            return repos;
        }
        
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                
                const fullPath = path.join(dirPath, entry.name);
                
                // Skip common non-repo directories
                if (['node_modules', '.git', 'dist', 'build', '.cache'].includes(entry.name)) {
                    continue;
                }
                
                // Check if it's a git repo
                try {
                    const gitPath = path.join(fullPath, '.git');
                    await fs.access(gitPath);
                    repos.push(fullPath);
                } catch {
                    // Not a git repo, search subdirectories
                    const subRepos = await this.findGitRepos(fullPath, maxDepth, currentDepth + 1);
                    repos.push(...subRepos);
                }
            }
        } catch (error) {
            this.logger.debug('Failed to search directory', {
                error: error.message,
                dirPath
            });
        }
        
        return repos;
    }

    /**
     * Load repository settings from database
     * @param {string} repoPath - Repository path
     * @returns {Promise<Object>}
     */
    async loadRepositorySettings(repoPath) {
        try {
            const query = `
                SELECT * FROM repository_settings
                WHERE repository_path = ?
            `;
            
            const row = this.db.db.prepare(query).get(repoPath);
            
            if (row) {
                return {
                    enabled: row.auto_commit_enabled === 1,
                    notifications: row.notification_preference === 'every_commit',
                    throttleMs: row.commit_throttle_seconds * 1000,
                    exclusions: JSON.parse(row.excluded_patterns || '[]'),
                    maxFileSize: row.max_file_size
                };
            }
        } catch (error) {
            this.logger.error('Failed to load repository settings', {
                error: error.message,
                repoPath
            });
        }
        
        return {};
    }

    /**
     * Save repository settings to database
     * @param {string} repoPath - Repository path
     * @param {Object} settings - Repository settings
     * @returns {Promise<void>}
     */
    async saveRepositorySettings(repoPath, settings) {
        try {
            const query = `
                INSERT OR REPLACE INTO repository_settings (
                    repository_path,
                    auto_commit_enabled,
                    notification_preference,
                    excluded_patterns,
                    commit_throttle_seconds,
                    max_file_size_mb,
                    shadow_branch_prefix
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            this.db.db.prepare(query).run(
                repoPath,
                settings.enabled ? 1 : 0,
                settings.notifications ? 'every_commit' : 'batched',
                JSON.stringify(settings.exclusions || []),
                (settings.throttleMs || 2000) / 1000,
                Math.round((settings.maxFileSize || 10485760) / (1024 * 1024)),
                settings.shadowPrefix || 'shadow/'
            );
        } catch (error) {
            this.logger.error('Failed to save repository settings', {
                error: error.message,
                repoPath
            });
        }
    }

    /**
     * Update repository status
     * @param {string} repoPath - Repository path
     * @param {boolean} enabled - Whether repository is enabled
     * @returns {Promise<void>}
     */
    async updateRepositoryStatus(repoPath, enabled) {
        try {
            const query = `
                UPDATE repository_settings
                SET auto_commit_enabled = ?
                WHERE repository_path = ?
            `;
            
            this.db.db.prepare(query).run(enabled ? 1 : 0, repoPath);
        } catch (error) {
            this.logger.error('Failed to update repository status', {
                error: error.message,
                repoPath
            });
        }
    }

    /**
     * Save commit to database
     * @param {string} commitHash - Commit hash
     * @param {string} shadowBranch - Shadow branch name
     * @param {string} originalBranch - Original branch name
     * @param {string} repoPath - Repository path
     * @param {string} filePath - File path
     * @param {string} message - Commit message
     * @param {Object} correlation - Conversation correlation
     * @returns {Promise<void>}
     */
    async saveCommitToDatabase(commitHash, shadowBranch, originalBranch, repoPath, filePath, message, correlation) {
        try {
            const query = `
                INSERT INTO shadow_commits (
                    commit_hash,
                    shadow_branch,
                    original_branch,
                    repository_path,
                    files_changed,
                    commit_message,
                    conversation_session_id,
                    correlation_confidence
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            this.db.db.prepare(query).run(
                commitHash,
                shadowBranch,
                originalBranch,
                repoPath,
                JSON.stringify([filePath]),
                message,
                correlation?.sessionId || null,
                correlation?.confidence || 0
            );
            
            // Also save correlation if exists
            if (correlation) {
                await this.correlator.saveCorrelation(
                    correlation.sessionId,
                    commitHash,
                    repoPath,
                    correlation.confidence
                );
            }
        } catch (error) {
            this.logger.error('Failed to save commit to database', {
                error: error.message,
                commitHash
            });
        }
    }

    /**
     * Save service statistics
     * @returns {Promise<void>}
     */
    async saveStatistics() {
        // Implementation for saving statistics to database
        // This would be expanded in production
        this.logger.info('Service statistics', this.getStatistics());
    }

    /**
     * Send notification
     * @param {string} repoPath - Repository path
     * @param {string} filePath - File path
     * @param {string} shadowBranch - Shadow branch name
     * @param {Object} correlation - Conversation correlation
     * @returns {Promise<void>}
     */
    async sendNotification(repoPath, filePath, shadowBranch, correlation) {
        try {
            const notificationData = {
                timestamp: new Date().toISOString(),
                type: 'auto_commit',
                repository: repoPath,
                file: filePath,
                branch: shadowBranch,
                commitHash: correlation?.commitHash || 'unknown',
                sessionId: correlation?.sessionId || null
            };
            
            // Write notification to shared file for Swift app to read
            const notificationFile = path.join(process.env.HOME || '/tmp', '.devmind-notifications.json');
            
            // Read existing notifications
            let notifications = [];
            try {
                if (fsSync.existsSync(notificationFile)) {
                    const existing = fsSync.readFileSync(notificationFile, 'utf8');
                    notifications = JSON.parse(existing);
                }
            } catch {
                // If file is corrupted, start fresh
                notifications = [];
            }
            
            // Add new notification
            notifications.push(notificationData);
            
            // Keep only last 10 notifications to prevent file growth
            if (notifications.length > 10) {
                notifications = notifications.slice(-10);
            }
            
            // Write updated notifications
            fsSync.writeFileSync(notificationFile, JSON.stringify(notifications, null, 2));
            
            this.logger.info('Notification written to file', {
                file: notificationFile,
                repository: path.basename(repoPath),
                fileName: path.basename(filePath)
            });
            
        } catch (error) {
            this.logger.error('Failed to write notification file', { error: error.message });
        }
    }

    /**
     * Send error notification to user
     * @param {Object} errorInfo - Error notification details
     * @returns {Promise<void>}
     */
    async sendErrorNotification(errorInfo) {
        this.logger.error('Error notification', {
            title: errorInfo.title,
            body: errorInfo.body,
            severity: errorInfo.severity,
            requiresAction: errorInfo.requiresAction
        });

        // Increment error statistics
        this.statistics.errors++;

        // TODO: Integrate with UNUserNotificationCenter in Phase 2c Priority 2 completion
        // This will connect to the macOS notification system through AppState
    }

    /**
     * Get service statistics
     * @returns {Object}
     */
    getStatistics() {
        const runtime = this.statistics.startTime 
            ? Date.now() - this.statistics.startTime 
            : 0;
        
        return {
            ...this.statistics,
            runtime: Math.floor(runtime / 1000),
            correlationRate: this.statistics.totalCommits > 0
                ? (this.statistics.correlatedCommits / this.statistics.totalCommits * 100).toFixed(1) + '%'
                : '0%',
            errorRate: this.statistics.totalCommits > 0
                ? (this.statistics.errors / (this.statistics.totalCommits + this.statistics.errors) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    /**
     * Get repository list
     * @returns {Array<Object>}
     */
    getRepositories() {
        return Array.from(this.activeRepositories.entries()).map(([path, config]) => ({
            path,
            ...config
        }));
    }
}

export default AutoCommitService;