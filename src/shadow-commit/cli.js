#!/usr/bin/env node

/**
 * Auto-Commit Service CLI
 * Command-line interface for testing and managing the auto-commit service
 * Phase 2 Implementation - AI Memory App
 */

import { Command } from 'commander';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../utils/logger.js';
import AutoCommitService from './auto-commit-service.js';
import chalk from 'chalk';
import ora from 'ora';

const execAsync = promisify(exec);

const logger = createLogger('AutoCommitCLI');
const program = new Command();

// Service instance
let service = null;

// Colors for output
const colors = {
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,
    dim: chalk.gray
};

/**
 * Initialize the auto-commit service
 */
async function initService(options = {}) {
    if (service) {
        return service;
    }
    
    service = new AutoCommitService({
        enabled: true,
        autoDetectRepos: options.autoDetect !== false,
        claudeProjectsPath: options.claudePath || path.join(process.env.HOME, '.claude', 'projects'),
        ...options
    });
    
    return service;
}

/**
 * Format repository info for display
 */
function formatRepository(repo, index) {
    const status = repo.enabled ? colors.success('✓') : colors.error('✗');
    const autoDetected = repo.autoDetected ? colors.dim(' (auto-detected)') : '';
    return `  ${index + 1}. ${status} ${repo.path}${autoDetected}`;
}

/**
 * Format statistics for display
 */
function formatStatistics(stats) {
    return `
${colors.info('📊 Service Statistics')}
  Runtime: ${stats.runtime}s
  Total Commits: ${stats.totalCommits}
  Correlated Commits: ${stats.correlatedCommits} (${stats.correlationRate})
  Active Repositories: ${stats.repositories}
  Errors: ${stats.errors} (${stats.errorRate})
`;
}

// Main CLI setup
program
    .name('auto-commit')
    .description('Auto-commit service CLI for Phase 2 implementation')
    .version('1.0.0');

// Start command
program
    .command('start')
    .description('Start the auto-commit service')
    .option('--no-auto-detect', 'Disable automatic repository detection')
    .option('--claude-path <path>', 'Path to Claude projects directory')
    .option('--repo <path>', 'Add specific repository to monitor')
    .action(async (options) => {
        const spinner = ora('Starting auto-commit service...').start();
        
        try {
            await initService(options);
            
            // Add specific repository if provided
            if (options.repo) {
                await service.addRepository(options.repo);
            }
            
            // Start the service
            await service.start();
            
            spinner.succeed(colors.success('Auto-commit service started successfully!'));
            
            const repos = service.getRepositories();
            if (repos.length > 0) {
                console.log('\n' + colors.info('Monitoring repositories:'));
                repos.forEach((repo, index) => {
                    console.log(formatRepository(repo, index));
                });
            } else {
                console.log(colors.warning('\n⚠️  No repositories found to monitor'));
                console.log(colors.dim('  Use "auto-commit add <path>" to add a repository'));
            }
            
            // Keep process running
            console.log('\n' + colors.dim('Press Ctrl+C to stop the service'));
            
            // Handle graceful shutdown
            process.on('SIGINT', async () => {
                console.log('\n' + colors.info('Stopping service...'));
                await service.stop();
                console.log(formatStatistics(service.getStatistics()));
                process.exit(0);
            });
            
        } catch (error) {
            spinner.fail(colors.error('Failed to start service'));
            console.error(colors.error(error.message));
            process.exit(1);
        }
    });

// Stop command
program
    .command('stop')
    .description('Stop the auto-commit service')
    .action(async () => {
        try {
            await initService();
            await service.stop();
            console.log(colors.success('✓ Service stopped'));
            console.log(formatStatistics(service.getStatistics()));
            process.exit(0);
        } catch (error) {
            console.error(colors.error('Failed to stop service:'), error.message);
            process.exit(1);
        }
    });

// Add repository command
program
    .command('add <path>')
    .description('Add a repository to monitor')
    .option('--no-enable', 'Add repository but keep it disabled')
    .option('--exclude <patterns...>', 'File patterns to exclude')
    .option('--throttle <ms>', 'Throttle time in milliseconds', '2000')
    .action(async (repoPath, options) => {
        const spinner = ora('Adding repository...').start();
        
        try {
            await initService();
            
            // Resolve absolute path
            const absolutePath = path.resolve(repoPath);
            
            await service.addRepository(absolutePath, {
                enabled: options.enable !== false,
                exclusions: options.exclude || [],
                throttleMs: parseInt(options.throttle) || 2000
            });
            
            spinner.succeed(colors.success(`Added repository: ${absolutePath}`));
            
            if (!service.isRunning) {
                console.log(colors.dim('  Service is not running. Use "auto-commit start" to begin monitoring'));
            }
            
        } catch (error) {
            spinner.fail(colors.error('Failed to add repository'));
            console.error(colors.error(error.message));
            process.exit(1);
        }
    });

// Remove repository command
program
    .command('remove <path>')
    .description('Remove a repository from monitoring')
    .action(async (repoPath) => {
        const spinner = ora('Removing repository...').start();
        
        try {
            await initService();
            
            const absolutePath = path.resolve(repoPath);
            await service.removeRepository(absolutePath);
            
            spinner.succeed(colors.success(`Removed repository: ${absolutePath}`));
        } catch (error) {
            spinner.fail(colors.error('Failed to remove repository'));
            console.error(colors.error(error.message));
            process.exit(1);
        }
    });

// List command
program
    .command('list')
    .description('List all monitored repositories')
    .action(async () => {
        try {
            await initService();
            const repos = service.getRepositories();
            
            if (repos.length === 0) {
                console.log(colors.warning('No repositories are being monitored'));
            } else {
                console.log(colors.info(`\n📁 Monitored Repositories (${repos.length}):\n`));
                repos.forEach((repo, index) => {
                    console.log(formatRepository(repo, index));
                    if (repo.exclusions && repo.exclusions.length > 0) {
                        console.log(colors.dim(`     Exclusions: ${repo.exclusions.join(', ')}`));
                    }
                    if (repo.throttleMs) {
                        console.log(colors.dim(`     Throttle: ${repo.throttleMs}ms`));
                    }
                });
            }
        } catch (error) {
            console.error(colors.error('Failed to list repositories:'), error.message);
            process.exit(1);
        }
    });

// Status command
program
    .command('status')
    .description('Show service status and statistics')
    .action(async () => {
        try {
            await initService();
            
            if (service.isRunning) {
                console.log(colors.success('✓ Service is running'));
            } else {
                console.log(colors.warning('⚠ Service is not running'));
            }
            
            console.log(formatStatistics(service.getStatistics()));
            
            const repos = service.getRepositories();
            if (repos.length > 0) {
                console.log(colors.info(`Active repositories: ${repos.length}`));
            }
        } catch (error) {
            console.error(colors.error('Failed to get status:'), error.message);
            process.exit(1);
        }
    });

// Test command
program
    .command('test <path>')
    .description('Test auto-commit with a specific file')
    .action(async (filePath) => {
        const spinner = ora('Testing auto-commit...').start();
        
        try {
            await initService();
            
            // Get repository path from file path
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            
            const absolutePath = path.resolve(filePath);
            const dir = path.dirname(absolutePath);
            
            // Find git root
            const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd: dir });
            const repoPath = stdout.trim();
            
            spinner.text = 'Creating test commit...';
            
            // Simulate file change
            await service.handleFileChange(
                repoPath,
                absolutePath,
                { isDirectory: false },
                { notifications: false }
            );
            
            spinner.succeed(colors.success('Test commit created successfully'));
            
            // Show statistics
            const stats = service.getStatistics();
            console.log(colors.info(`\nCommits created: ${stats.totalCommits}`));
            console.log(colors.info(`Correlated: ${stats.correlatedCommits}`));
            
        } catch (error) {
            spinner.fail(colors.error('Test failed'));
            console.error(colors.error(error.message));
            process.exit(1);
        }
    });

// Watch command (interactive mode)
program
    .command('watch')
    .description('Start service in watch mode with live updates')
    .action(async () => {
        console.clear();
        console.log(colors.info('🔍 Auto-Commit Service - Watch Mode\n'));
        
        try {
            await initService({ autoDetectRepos: true });
            await service.start();
            
            // Display initial status
            const repos = service.getRepositories();
            console.log(colors.info(`Monitoring ${repos.length} repositories\n`));
            
            // Set up live display
            const updateInterval = setInterval(() => {
                const stats = service.getStatistics();
                process.stdout.write('\r' + colors.dim(
                    `Commits: ${stats.totalCommits} | ` +
                    `Correlated: ${stats.correlatedCommits} | ` +
                    `Runtime: ${stats.runtime}s`
                ));
            }, 1000);
            
            // Handle shutdown
            process.on('SIGINT', async () => {
                clearInterval(updateInterval);
                console.log('\n\n' + colors.info('Stopping watch mode...'));
                await service.stop();
                console.log(formatStatistics(service.getStatistics()));
                process.exit(0);
            });
            
        } catch (error) {
            console.error(colors.error('Failed to start watch mode:'), error.message);
            process.exit(1);
        }
    });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (process.argv.length === 2) {
    program.help();
}