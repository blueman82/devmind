#!/usr/bin/env node

/**
 * Real-time indexer monitoring dashboard
 * Shows FileWatcher progress, database statistics, and indexing activity
 */

import FileWatcher from './src/indexer/file-watcher.js';
import DatabaseManager from './src/database/database-manager.js';
import { createLogger } from './src/utils/logger.js';
import ConfigValidator from './src/utils/config-validator.js';
import HealthChecker from './src/utils/health-check.js';
import { promises as fs } from 'fs';

const logger = createLogger('Monitor');

console.log('📊 AI Memory App - Indexer Monitoring Dashboard\n');

let watcher;
let dbManager;
let healthChecker;
let monitoringInterval;

// ANSI colors for better output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function colorize(color, text) {
    return `${colors[color]}${text}${colors.reset}`;
}

function formatNumber(num) {
    return num.toLocaleString();
}

function formatTime(isoString) {
    if (!isoString || isoString === 'never') return 'never';
    try {
        return new Date(isoString).toLocaleString();
    } catch {
        return 'invalid date';
    }
}

async function displayStatus() {
    console.clear();
    console.log(colorize('cyan', '📊 AI Memory App - Indexer Status Dashboard'));
    console.log('═'.repeat(80));
    console.log(`${colorize('yellow', '⏰ Last Updated:')} ${new Date().toLocaleString()}\n`);

    try {
        // FileWatcher Status
        const watcherStatus = watcher ? watcher.getStatus() : { isRunning: false };
        console.log(colorize('bright', '🔍 FileWatcher Status:'));
        console.log(`   Running: ${watcherStatus.isRunning ? colorize('green', '✅ YES') : colorize('red', '❌ NO')}`);
        console.log(`   Watched Directories: ${colorize('blue', watcherStatus.watchedDirectories?.length || 0)}`);
        console.log(`   Pending Indexes: ${colorize('yellow', watcherStatus.pendingIndexes || 0)}`);
        console.log(`   Active Indexing: ${colorize('yellow', watcherStatus.activeIndexing || 0)}`);
        
        if (watcherStatus.watchedDirectories?.length > 0) {
            console.log(`   Monitoring:`);
            watcherStatus.watchedDirectories.forEach(dir => {
                const dirName = dir === 'main' ? 'Main Projects Directory' : 
                               dir === 'parent' ? 'Parent Directory (.claude)' :
                               dir.split('/').pop();
                console.log(`     • ${dirName}`);
            });
        }

        // Database Statistics
        if (dbManager?.isInitialized) {
            console.log(`\n${colorize('bright', '💾 Database Statistics:')}`);
            try {
                const stats = dbManager.getStats();
            
            // Get conversation and message counts
            const convCount = dbManager.db.prepare('SELECT COUNT(*) as count FROM conversations').get();
            const msgCount = dbManager.db.prepare('SELECT COUNT(*) as count FROM messages').get();
            const ftsCount = dbManager.db.prepare('SELECT COUNT(*) as count FROM messages_fts').get();
            
            console.log(`   Conversations Indexed: ${colorize('green', formatNumber(convCount.count))}`);
            console.log(`   Messages Indexed: ${colorize('green', formatNumber(msgCount.count))}`);
            console.log(`   FTS5 Entries: ${colorize('green', formatNumber(ftsCount.count))}`);
            console.log(`   Last Full Index: ${colorize('blue', formatTime(stats.last_full_index))}`);
            console.log(`   Last Incremental: ${colorize('blue', formatTime(stats.last_incremental_index))}`);
            
            // Recent activity
            const recentConvs = dbManager.db.prepare(`
                SELECT COUNT(*) as count FROM conversations 
                WHERE created_at > datetime('now', '-1 hour')
            `).get();
            
            console.log(`   Indexed This Hour: ${colorize('yellow', formatNumber(recentConvs.count))} conversations`);
            } catch (dbError) {
                logger.error('Database statistics query failed', { error: dbError.message, stack: dbError.stack });
                console.error(`   ${colorize('red', 'Database Error: ' + dbError.message)}`);
                console.error(`   ${colorize('red', 'Stack trace: ' + dbError.stack)}`);
                console.log(`   ${colorize('yellow', 'Database statistics temporarily unavailable')}`);
            }
        } else {
            console.log(`\n${colorize('bright', '💾 Database:')} ${colorize('red', 'Not Connected')}`);
        }

        // Project Discovery  
        if (watcher?.claudeProjectsPath) {
            console.log(`\n${colorize('bright', '📁 Project Discovery:')}`);
            console.log(`   Monitoring Path: ${colorize('blue', watcher.claudeProjectsPath)}`);
            
            try {
                await Promise.race([
                    fs.access(watcher.claudeProjectsPath),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
                ]);
                console.log(`   Directory Status: ${colorize('green', '✅ EXISTS')}`);
                
                // Try to count projects with timeout
                const entries = await Promise.race([
                    fs.readdir(watcher.claudeProjectsPath, { withFileTypes: true }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Directory read timeout')), 3000))
                ]);
                const projectDirs = entries.filter(e => e.isDirectory()).length;
                console.log(`   Project Directories: ${colorize('blue', formatNumber(projectDirs))}`);
                
                // Show recent projects
                if (projectDirs > 0) {
                    const recentDirs = entries
                        .filter(e => e.isDirectory())
                        .slice(0, 5)
                        .map(e => e.name);
                    console.log(`   Recent Projects:`);
                    recentDirs.forEach(name => {
                        console.log(`     • ${name.substring(0, 16)}${name.length > 16 ? '...' : ''}`);
                    });
                }
            } catch {
                console.log(`   Directory Status: ${colorize('red', '❌ NOT FOUND')}`);
                console.log(`   Note: ${colorize('yellow', 'Waiting for Claude projects to be created...')}`);
            }
        }


        // Controls
        console.log(`\n${colorize('bright', '🎛️  Controls:')}`);
        console.log(`   Press ${colorize('yellow', 'Ctrl+C')} to stop monitoring`);
        console.log(`   Press ${colorize('yellow', 'r')} to restart FileWatcher`);
        console.log(`   Press ${colorize('yellow', 'f')} to perform full index`);
        console.log(`   Press ${colorize('yellow', 'p')} to run performance test`);
        console.log(`   Press ${colorize('yellow', 's')} to show search test`);
        console.log(`   Press ${colorize('yellow', 'h')} to run health check`);
        console.log(`   Press ${colorize('yellow', 'm')} to show performance metrics`);

    } catch (error) {
        logger.error('Status display error', { error: error.message, stack: error.stack });
        console.error(colorize('red', `Error displaying status: ${error.message}`));
        console.error(colorize('red', `Stack trace: ${error.stack}`));
    }
}

async function startMonitoring() {
    try {
        console.log('Starting indexer monitoring...\n');
        
        // Validate configuration first
        const validator = new ConfigValidator();
        await validator.validateOrExit();
        
        // Initialize database manager
        dbManager = new DatabaseManager();
        await dbManager.initialize();
        logger.info('Database connected successfully');
        console.log(colorize('green', '✅ Database connected'));

        // Start FileWatcher
        watcher = new FileWatcher();
        await watcher.start();
        logger.info('FileWatcher started successfully');
        console.log(colorize('green', '✅ FileWatcher started'));

        // Initialize health checker
        healthChecker = new HealthChecker({
            dbManager,
            fileWatcher: watcher
        });
        logger.info('Health checker initialized');
        console.log(colorize('green', '✅ Health checker initialized'));

        // Display initial status
        setTimeout(() => displayStatus().catch(console.error), 500);

        // Update every 2 seconds
        monitoringInterval = setInterval(() => displayStatus().catch(console.error), 2000);

        // Handle keyboard input
        if (typeof process.stdin.setRawMode === 'function') {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
        } else {
            console.log(colorize('yellow', '⚠️  Interactive controls not available in this environment'));
        }
        
        process.stdin.on('data', async (key) => {
            if (key === '\u0003') { // Ctrl+C
                await cleanup();
                process.exit(0);
            } else if (key === 'r') {
                logger.info('User initiated FileWatcher restart');
                console.log(colorize('yellow', '\n🔄 Restarting FileWatcher...'));
                watcher.stop();
                watcher = new FileWatcher();
                await watcher.start();
                logger.info('FileWatcher restart completed');
                console.log(colorize('green', '✅ FileWatcher restarted'));
                setTimeout(() => displayStatus().catch(console.error), 500);
            } else if (key === 'f') {
                logger.info('User initiated full index operation');
                console.log(colorize('yellow', '\n📂 Performing full index...'));
                await watcher.performFullIndex();
                logger.info('Full index operation completed');
                console.log(colorize('green', '✅ Full index completed'));
                setTimeout(() => displayStatus().catch(console.error), 500);
            } else if (key === 'p') {
                console.log(colorize('yellow', '\n⚡ Running performance test...'));
                if (dbManager?.isInitialized) {
                    try {
                        const startTime = Date.now();
                        const testResults = dbManager.searchConversations('test', { limit: 1 });
                        const searchTime = Date.now() - startTime;
                        console.log(`   Search Response Time: ${colorize('green', searchTime + 'ms')}`);
                        console.log(`   Search Results Found: ${colorize('blue', testResults.length)}`);
                    } catch (perfError) {
                        logger.error('Performance test failed', { error: perfError.message, stack: perfError.stack });
                        console.error(`   Performance Test: ${colorize('red', 'Error - ' + perfError.message)}`);
                        console.error(`   Stack trace: ${colorize('red', perfError.stack)}`);
                    }
                } else {
                    console.log(`   ${colorize('red', 'Database not initialized')}`);
                }
                setTimeout(() => displayStatus().catch(console.error), 2000);
            } else if (key === 's') {
                console.log(colorize('yellow', '\n🔍 Testing search functionality...'));
                const results = dbManager.searchConversations('authentication database', { limit: 3 });
                console.log(`Found ${results.length} results for 'authentication database':`);
                results.forEach((result, i) => {
                    console.log(`  ${i + 1}. ${result.session_id} (score: ${result.relevance_score?.toFixed(4) || 'N/A'})`);
                });
                setTimeout(() => displayStatus().catch(console.error), 2000);
            } else if (key === 'h') {
                console.log(colorize('yellow', '\n🏥 Running health check...'));
                if (healthChecker) {
                    try {
                        const healthResult = await healthChecker.runHealthCheck();
                        console.log(`\n${colorize('bright', '🏥 Health Check Results:')}`);
                        console.log(`   Overall Status: ${healthResult.status === 'healthy' ? colorize('green', '✅ HEALTHY') : 
                                                         healthResult.status === 'warning' ? colorize('yellow', '⚠️ WARNING') : 
                                                         colorize('red', '❌ UNHEALTHY')}`);
                        console.log(`   Checks Passed: ${colorize('green', healthResult.summary.passed)}/${healthResult.summary.total}`);
                        console.log(`   Warnings: ${colorize('yellow', healthResult.summary.warnings)}`);
                        console.log(`   Failures: ${colorize('red', healthResult.summary.failed)}`);
                        
                        // Show failed checks
                        for (const [checkName, result] of Object.entries(healthResult.checks)) {
                            if (result.status !== 'healthy') {
                                console.log(`   ${checkName}: ${result.status === 'warning' ? colorize('yellow', '⚠️ ' + result.message) : colorize('red', '❌ ' + result.message)}`);
                            }
                        }
                    } catch (healthError) {
                        console.error(`   Health Check: ${colorize('red', 'Error - ' + healthError.message)}`);
                        logger.error('Health check failed', { error: healthError.message, stack: healthError.stack });
                    }
                } else {
                    console.log(`   ${colorize('red', 'Health checker not initialized')}`);
                }
                setTimeout(() => displayStatus().catch(console.error), 3000);
            } else if (key === 'm') {
                console.log(colorize('yellow', '\n📊 Performance Metrics Report...'));
                if (dbManager?.getPerformanceMetrics()) {
                    try {
                        const metricsReport = dbManager.getPerformanceReport(60000); // 1 minute window
                        console.log(`\n${colorize('bright', '📊 Performance Metrics (Last 60s):')}`);
                        console.log(`   Uptime: ${colorize('blue', metricsReport.uptimeHuman)}`);
                        
                        // Database metrics
                        const dbMetrics = metricsReport.categories.database;
                        if (dbMetrics && dbMetrics.operationCount > 0) {
                            console.log(`   Database Operations: ${colorize('green', dbMetrics.operationCount)}`);
                            console.log(`   Avg Query Time: ${colorize(dbMetrics.avgExecutionTime > 50 ? 'yellow' : 'green', dbMetrics.avgExecutionTime + 'ms')}`);
                            console.log(`   Max Query Time: ${colorize(dbMetrics.maxExecutionTime > 100 ? 'red' : 'green', dbMetrics.maxExecutionTime + 'ms')}`);
                        }
                        
                        // Search metrics
                        const searchMetrics = metricsReport.categories.search;
                        if (searchMetrics && searchMetrics.operationCount > 0) {
                            console.log(`   Search Operations: ${colorize('green', searchMetrics.operationCount)}`);
                            console.log(`   Avg Search Time: ${colorize(searchMetrics.avgExecutionTime > 200 ? 'yellow' : 'green', searchMetrics.avgExecutionTime + 'ms')}`);
                        }
                        
                        // Performance indicators
                        const indicators = metricsReport.performanceIndicators;
                        console.log(`   Overall Status: ${indicators.status === 'healthy' ? colorize('green', '✅ HEALTHY') : 
                                                      indicators.status === 'warning' ? colorize('yellow', '⚠️ WARNING') : 
                                                      colorize('red', '❌ ISSUES')}`);
                        
                        if (indicators.issues.length > 0) {
                            console.log(`   Issues:`);
                            indicators.issues.forEach(issue => {
                                console.log(`     • ${colorize('yellow', issue)}`);
                            });
                        }
                        
                    } catch (metricsError) {
                        console.error(`   Performance Metrics: ${colorize('red', 'Error - ' + metricsError.message)}`);
                        logger.error('Performance metrics failed', { error: metricsError.message, stack: metricsError.stack });
                    }
                } else {
                    console.log(`   ${colorize('red', 'Performance metrics not available')}`);
                }
                setTimeout(() => displayStatus().catch(console.error), 4000);
            }
        });

    } catch (error) {
        logger.error('Monitor startup failed', { error: error.message, stack: error.stack });
        console.error(colorize('red', `Failed to start monitoring: ${error.message}`));
        console.error(colorize('red', `Stack trace: ${error.stack}`));
        process.exit(1);
    }
}

async function cleanup() {
    logger.info('Monitor cleanup initiated');
    console.log(colorize('yellow', '\n🧹 Cleaning up...'));
    
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    
    if (watcher) {
        watcher.stop();
        console.log('✅ FileWatcher stopped');
    }
    
    if (dbManager) {
        dbManager.close();
        console.log('✅ Database closed');
    }
    
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
    }
    
    console.log(colorize('green', 'Monitoring stopped.'));
}

// Handle process termination
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Start monitoring
startMonitoring().catch(console.error);