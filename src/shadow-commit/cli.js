#!/usr/bin/env node

/**
 * Auto-Commit Service Test CLI
 * Simple CLI for testing the auto-commit service
 * Phase 2 Implementation - AI Memory App
 */

import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import AutoCommitService from './auto-commit-service.js';

const execAsync = promisify(exec);

// ANSI color codes for simple output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    gray: '\x1b[90m',
    reset: '\x1b[0m'
};

// Service instance
let service = null;

/**
 * Print colored message
 */
function print(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Initialize service
 */
async function initService() {
    if (!service) {
        service = new AutoCommitService({
            enabled: true,
            autoDetectRepos: true,
            claudeProjectsPath: path.join(process.env.HOME, '.claude', 'projects')
        });
    }
    return service;
}

/**
 * Main CLI function
 */
async function main() {
    const [,, command, ...args] = process.argv;
    
    if (!command || command === 'help') {
        showHelp();
        return;
    }
    
    try {
        await initService();
        
        switch (command) {
            case 'start':
                await startCommand();
                break;
                
            case 'add':
                await addCommand(args[0]);
                break;
                
            case 'test':
                await testCommand(args[0]);
                break;
                
            case 'list':
                await listCommand();
                break;
                
            case 'status':
                await statusCommand();
                break;
                
            default:
                print('red', `Unknown command: ${command}`);
                showHelp();
                process.exit(1);
        }
    } catch (error) {
        print('red', `Error: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Show help message
 */
function showHelp() {
    console.log(`
${colors.blue}Auto-Commit Service Test CLI${colors.reset}

Usage: node cli.js [command] [options]

Commands:
  start           Start the auto-commit service
  add <path>      Add a repository to monitor
  test <file>     Test auto-commit with a specific file
  list            List monitored repositories
  status          Show service status
  help            Show this help message

Examples:
  node cli.js start
  node cli.js add /path/to/repo
  node cli.js test /path/to/file.js
`);
}

/**
 * Start command
 */
async function startCommand() {
    print('blue', 'Starting auto-commit service...');
    
    await service.start();
    print('green', '✓ Service started successfully');
    
    const repos = service.getRepositories();
    if (repos.length > 0) {
        print('blue', `\nMonitoring ${repos.length} repositories:`);
        repos.forEach((repo, i) => {
            const status = repo.enabled ? '✓' : '✗';
            console.log(`  ${i + 1}. ${status} ${repo.path}`);
        });
    } else {
        print('yellow', '\n⚠ No repositories found to monitor');
        print('gray', 'Use "add <path>" to add a repository');
    }
    
    // Keep running until Ctrl+C
    print('gray', '\nPress Ctrl+C to stop');
    
    process.on('SIGINT', async () => {
        print('blue', '\n\nStopping service...');
        await service.stop();
        
        const stats = service.getStatistics();
        console.log(`
${colors.blue}Statistics:${colors.reset}
  Runtime: ${stats.runtime}s
  Total Commits: ${stats.totalCommits}
  Correlated: ${stats.correlatedCommits} (${stats.correlationRate})
  Errors: ${stats.errors}
`);
        process.exit(0);
    });
    
    // Keep process alive
    await new Promise(() => {});
}

/**
 * Add repository command
 */
async function addCommand(repoPath) {
    if (!repoPath) {
        print('red', 'Please provide a repository path');
        process.exit(1);
    }
    
    const absolutePath = path.resolve(repoPath);
    print('blue', `Adding repository: ${absolutePath}`);
    
    await service.addRepository(absolutePath);
    print('green', '✓ Repository added successfully');
}

/**
 * Test command
 */
async function testCommand(filePath) {
    if (!filePath) {
        print('red', 'Please provide a file path');
        process.exit(1);
    }
    
    const absolutePath = path.resolve(filePath);
    print('blue', `Testing auto-commit for: ${absolutePath}`);
    
    // Find repository root
    const dir = path.dirname(absolutePath);
    const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd: dir });
    const repoPath = stdout.trim();
    
    // Ensure repository is added
    await service.addRepository(repoPath);
    
    // Start service if not running
    if (!service.isRunning) {
        await service.start();
    }
    
    // Simulate file change
    await service.handleFileChange(
        repoPath,
        absolutePath,
        { isDirectory: false },
        { notifications: false }
    );
    
    print('green', '✓ Test commit created successfully');
    
    const stats = service.getStatistics();
    console.log(`  Commits: ${stats.totalCommits}`);
    console.log(`  Correlated: ${stats.correlatedCommits}`);
}

/**
 * List command
 */
async function listCommand() {
    const repos = service.getRepositories();
    
    if (repos.length === 0) {
        print('yellow', 'No repositories are being monitored');
    } else {
        print('blue', `Monitored Repositories (${repos.length}):\n`);
        repos.forEach((repo, i) => {
            const status = repo.enabled ? '✓' : '✗';
            const auto = repo.autoDetected ? ' (auto)' : '';
            console.log(`  ${i + 1}. ${status} ${repo.path}${auto}`);
        });
    }
}

/**
 * Status command
 */
async function statusCommand() {
    const running = service.isRunning;
    const stats = service.getStatistics();
    const repos = service.getRepositories();
    
    console.log(`
${colors.blue}Service Status:${colors.reset}
  Running: ${running ? colors.green + 'Yes' : colors.red + 'No'}${colors.reset}
  Repositories: ${repos.length}
  Total Commits: ${stats.totalCommits}
  Correlated: ${stats.correlatedCommits} (${stats.correlationRate})
  Runtime: ${stats.runtime}s
  Errors: ${stats.errors}
`);
}

// Run the CLI
main().catch(error => {
    print('red', `Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
});