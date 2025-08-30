#!/usr/bin/env node

/**
 * Real-time indexer monitoring dashboard
 * Shows FileWatcher progress, database statistics, and indexing activity
 */

import FileWatcher from './src/indexer/file-watcher.js';
import DatabaseManager from './src/database/database-manager.js';

console.log('📊 AI Memory App - Indexer Monitoring Dashboard\n');

let watcher;
let dbManager;
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

function displayStatus() {
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
        } else {
            console.log(`\n${colorize('bright', '💾 Database:')} ${colorize('red', 'Not Connected')}`);
        }

        // Project Discovery
        if (watcher?.claudeProjectsPath) {
            console.log(`\n${colorize('bright', '📁 Project Discovery:')}`);
            console.log(`   Monitoring Path: ${colorize('blue', watcher.claudeProjectsPath)}`);
            
            try {
                const fs = await import('fs');
                await fs.promises.access(watcher.claudeProjectsPath);
                console.log(`   Directory Status: ${colorize('green', '✅ EXISTS')}`);
                
                // Try to count projects
                const entries = await fs.promises.readdir(watcher.claudeProjectsPath, { withFileTypes: true });
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
            } catch (error) {
                console.log(`   Directory Status: ${colorize('red', '❌ NOT FOUND')}`);
                console.log(`   Note: ${colorize('yellow', 'Waiting for Claude projects to be created...')}`);
            }
        }

        // Performance Metrics
        console.log(`\n${colorize('bright', '⚡ Performance Metrics:')}`);
        if (dbManager?.isInitialized) {
            const startTime = Date.now();
            const testResults = dbManager.searchConversations('test', { limit: 1 });
            const searchTime = Date.now() - startTime;
            console.log(`   Search Response Time: ${colorize('green', searchTime + 'ms')}`);
            console.log(`   Search Results Found: ${colorize('blue', formatNumber(testResults.length))}`);
        }

        // Controls
        console.log(`\n${colorize('bright', '🎛️  Controls:')}`);
        console.log(`   Press ${colorize('yellow', 'Ctrl+C')} to stop monitoring`);
        console.log(`   Press ${colorize('yellow', 'r')} to restart FileWatcher`);
        console.log(`   Press ${colorize('yellow', 'f')} to perform full index`);
        console.log(`   Press ${colorize('yellow', 's')} to show search test`);

    } catch (error) {
        console.log(colorize('red', `Error displaying status: ${error.message}`));
    }
}

async function startMonitoring() {
    try {
        console.log('Starting indexer monitoring...\n');
        
        // Initialize database manager
        dbManager = new DatabaseManager();
        await dbManager.initialize();
        console.log(colorize('green', '✅ Database connected'));

        // Start FileWatcher
        watcher = new FileWatcher();
        await watcher.start();
        console.log(colorize('green', '✅ FileWatcher started'));

        // Display initial status
        setTimeout(displayStatus, 500);

        // Update every 2 seconds
        monitoringInterval = setInterval(displayStatus, 2000);

        // Handle keyboard input
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        
        process.stdin.on('data', async (key) => {
            if (key === '\u0003') { // Ctrl+C
                await cleanup();
                process.exit(0);
            } else if (key === 'r') {
                console.log(colorize('yellow', '\n🔄 Restarting FileWatcher...'));
                watcher.stop();
                watcher = new FileWatcher();
                await watcher.start();
                console.log(colorize('green', '✅ FileWatcher restarted'));
                setTimeout(displayStatus, 500);
            } else if (key === 'f') {
                console.log(colorize('yellow', '\n📂 Performing full index...'));
                await watcher.performFullIndex();
                console.log(colorize('green', '✅ Full index completed'));
                setTimeout(displayStatus, 500);
            } else if (key === 's') {
                console.log(colorize('yellow', '\n🔍 Testing search functionality...'));
                const results = dbManager.searchConversations('authentication database', { limit: 3 });
                console.log(`Found ${results.length} results for 'authentication database':`);
                results.forEach((result, i) => {
                    console.log(`  ${i + 1}. ${result.session_id} (score: ${result.relevance_score?.toFixed(4) || 'N/A'})`);
                });
                setTimeout(displayStatus, 2000);
            }
        });

    } catch (error) {
        console.error(colorize('red', `Failed to start monitoring: ${error.message}`));
        process.exit(1);
    }
}

async function cleanup() {
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