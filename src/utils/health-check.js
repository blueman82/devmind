import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('HealthCheck');

/**
 * Health check utilities for AI Memory App
 * Provides system health monitoring and status endpoints
 */

export class HealthChecker {
    constructor(options = {}) {
        this.dbManager = options.dbManager;
        this.fileWatcher = options.fileWatcher;
        this.checkInterval = options.checkInterval || 30000; // 30 seconds
        this.healthHistory = [];
        this.maxHistorySize = options.maxHistorySize || 100;
        
        this.checks = {
            database: this.checkDatabase.bind(this),
            fileSystem: this.checkFileSystem.bind(this),
            fileWatcher: this.checkFileWatcher.bind(this),
            memory: this.checkMemoryUsage.bind(this),
            diskSpace: this.checkDiskSpace.bind(this)
        };
    }

    /**
     * Run all health checks and return comprehensive status
     */
    async runHealthCheck() {
        const timestamp = new Date().toISOString();
        const results = {
            timestamp,
            status: 'healthy',
            checks: {},
            summary: {
                total: Object.keys(this.checks).length,
                passed: 0,
                failed: 0,
                warnings: 0
            }
        };

        logger.debug('Starting health check run');

        // Run all health checks
        for (const [checkName, checkFn] of Object.entries(this.checks)) {
            try {
                const checkResult = await checkFn();
                results.checks[checkName] = {
                    status: checkResult.status,
                    message: checkResult.message,
                    details: checkResult.details,
                    timestamp: new Date().toISOString()
                };

                // Update summary
                if (checkResult.status === 'healthy') {
                    results.summary.passed++;
                } else if (checkResult.status === 'warning') {
                    results.summary.warnings++;
                } else {
                    results.summary.failed++;
                    results.status = 'unhealthy';
                }

            } catch (error) {
                logger.error('Health check failed', { checkName, error: error.message });
                results.checks[checkName] = {
                    status: 'error',
                    message: `Check failed: ${error.message}`,
                    timestamp: new Date().toISOString()
                };
                results.summary.failed++;
                results.status = 'unhealthy';
            }
        }

        // Determine overall status
        if (results.summary.failed > 0) {
            results.status = 'unhealthy';
        } else if (results.summary.warnings > 0) {
            results.status = 'warning';
        }

        // Store in history
        this.addToHistory(results);

        logger.info('Health check completed', {
            status: results.status,
            passed: results.summary.passed,
            failed: results.summary.failed,
            warnings: results.summary.warnings
        });

        return results;
    }

    /**
     * Check database connectivity and performance
     */
    async checkDatabase() {
        if (!this.dbManager || !this.dbManager.isInitialized) {
            return {
                status: 'error',
                message: 'Database not initialized',
                details: {}
            };
        }

        try {
            const startTime = Date.now();
            
            // Test basic query
            const result = this.dbManager.db.prepare('SELECT 1 as test').get();
            const queryTime = Date.now() - startTime;
            
            // Get database statistics
            const stats = this.dbManager.getStats();
            const conversationCount = this.dbManager.db.prepare('SELECT COUNT(*) as count FROM conversations').get();
            const messageCount = this.dbManager.db.prepare('SELECT COUNT(*) as count FROM messages').get();

            // Check query performance
            const performanceStatus = queryTime > 100 ? 'warning' : 'healthy';
            const performanceMessage = queryTime > 100 ? 
                `Slow database query (${queryTime}ms)` : 
                `Database responding well (${queryTime}ms)`;

            return {
                status: performanceStatus,
                message: performanceMessage,
                details: {
                    queryTime,
                    conversationsIndexed: conversationCount.count,
                    messagesIndexed: messageCount.count,
                    lastFullIndex: stats.last_full_index || 'never',
                    lastIncremental: stats.last_incremental_index || 'never'
                }
            };

        } catch (error) {
            return {
                status: 'error',
                message: `Database check failed: ${error.message}`,
                details: { error: error.message }
            };
        }
    }

    /**
     * Check file system accessibility and permissions
     */
    async checkFileSystem() {
        const pathsToCheck = [
            join(homedir(), '.claude'),
            join(homedir(), '.claude', 'ai-memory'),
            join(homedir(), '.claude', 'ai-memory', 'logs')
        ];

        const results = {};
        let hasErrors = false;

        for (const path of pathsToCheck) {
            try {
                await fs.access(path, fs.constants.R_OK | fs.constants.W_OK);
                results[path] = 'accessible';
            } catch (error) {
                results[path] = `error: ${error.message}`;
                hasErrors = true;
            }
        }

        return {
            status: hasErrors ? 'error' : 'healthy',
            message: hasErrors ? 'File system access issues detected' : 'File system accessible',
            details: results
        };
    }

    /**
     * Check FileWatcher status and performance
     */
    async checkFileWatcher() {
        if (!this.fileWatcher) {
            return {
                status: 'warning',
                message: 'FileWatcher not available for monitoring',
                details: {}
            };
        }

        try {
            const status = this.fileWatcher.getStatus();
            
            return {
                status: status.isRunning ? 'healthy' : 'error',
                message: status.isRunning ? 'FileWatcher active' : 'FileWatcher not running',
                details: {
                    isRunning: status.isRunning,
                    watchedDirectories: status.watchedDirectories?.length || 0,
                    pendingIndexes: status.pendingIndexes || 0,
                    activeIndexing: status.activeIndexing || 0
                }
            };

        } catch (error) {
            return {
                status: 'error',
                message: `FileWatcher check failed: ${error.message}`,
                details: { error: error.message }
            };
        }
    }

    /**
     * Check memory usage
     */
    async checkMemoryUsage() {
        const memUsage = process.memoryUsage();
        const memUsageMB = {
            rss: Math.round(memUsage.rss / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024)
        };

        // Warning thresholds (in MB)
        const warnThreshold = 512;
        const errorThreshold = 1024;

        let status = 'healthy';
        let message = `Memory usage normal (RSS: ${memUsageMB.rss}MB)`;

        if (memUsageMB.rss > errorThreshold) {
            status = 'error';
            message = `High memory usage (RSS: ${memUsageMB.rss}MB)`;
        } else if (memUsageMB.rss > warnThreshold) {
            status = 'warning';
            message = `Elevated memory usage (RSS: ${memUsageMB.rss}MB)`;
        }

        return {
            status,
            message,
            details: memUsageMB
        };
    }

    /**
     * Check available disk space
     */
    async checkDiskSpace() {
        try {
            const dbPath = join(homedir(), '.claude', 'ai-memory');
            
            // Get database file size
            let dbSize = 0;
            try {
                const dbFile = join(dbPath, 'conversations.db');
                const stats = await fs.stat(dbFile);
                dbSize = Math.round(stats.size / 1024 / 1024); // MB
            } catch {
                // Database file doesn't exist yet
            }

            return {
                status: 'healthy',
                message: `Database size: ${dbSize}MB`,
                details: {
                    databaseSizeMB: dbSize,
                    databasePath: dbPath
                }
            };

        } catch (error) {
            return {
                status: 'warning',
                message: `Could not check disk space: ${error.message}`,
                details: { error: error.message }
            };
        }
    }

    /**
     * Get health check history
     */
    getHealthHistory() {
        return [...this.healthHistory];
    }

    /**
     * Get simplified health status
     */
    async getHealthStatus() {
        const fullCheck = await this.runHealthCheck();
        
        return {
            status: fullCheck.status,
            timestamp: fullCheck.timestamp,
            summary: fullCheck.summary,
            message: this.generateStatusMessage(fullCheck)
        };
    }

    /**
     * Add result to history with size limit
     */
    addToHistory(result) {
        this.healthHistory.unshift(result);
        
        if (this.healthHistory.length > this.maxHistorySize) {
            this.healthHistory = this.healthHistory.slice(0, this.maxHistorySize);
        }
    }

    /**
     * Generate human-readable status message
     */
    generateStatusMessage(checkResult) {
        const { status, summary } = checkResult;
        
        if (status === 'healthy') {
            return `All systems operational (${summary.passed}/${summary.total} checks passed)`;
        } else if (status === 'warning') {
            return `Minor issues detected (${summary.warnings} warnings, ${summary.failed} failures)`;
        } else {
            return `System issues detected (${summary.failed} failures, ${summary.warnings} warnings)`;
        }
    }

    /**
     * Start periodic health monitoring
     */
    startPeriodicChecks() {
        if (this.intervalId) {
            return; // Already running
        }

        logger.info('Starting periodic health checks', { interval: this.checkInterval });
        
        this.intervalId = setInterval(async () => {
            try {
                await this.runHealthCheck();
            } catch (error) {
                logger.error('Periodic health check failed', { error: error.message });
            }
        }, this.checkInterval);
    }

    /**
     * Stop periodic health monitoring
     */
    stopPeriodicChecks() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.info('Stopped periodic health checks');
        }
    }
}

export default HealthChecker;