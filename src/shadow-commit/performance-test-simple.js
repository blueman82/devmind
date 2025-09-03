#!/usr/bin/env node

/**
 * Simplified Performance Testing for Multi-Repository Auto-Commit System
 * Phase 2c Priority 3 - Performance Validation (Simplified)
 * 
 * This simplified version:
 * 1. Creates only 3 test repositories
 * 2. Uses lower concurrency to avoid SPAWN EBADF errors
 * 3. Focuses on core metrics validation
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import PerformanceMonitor from './performance-monitor.js';
import { createLogger } from '../utils/logger.js';
import chalk from 'chalk';
import ShadowBranchManager from './shadow-branch-manager.js';

const execAsync = promisify(exec);
const logger = createLogger('SimplePerfTest');

class SimplifiedPerformanceTest {
    constructor() {
        this.config = {
            testRepoCount: 3,
            baseTestPath: '/tmp/devmind-simple-perf-test',
            filesPerRepo: 5,
            changesPerRepo: 10
        };
        
        this.performanceMonitor = new PerformanceMonitor();
        this.shadowBranchManager = new ShadowBranchManager();
        this.testRepos = [];
        this.results = {
            repositories: [],
            totalCommits: 0,
            totalErrors: 0,
            averageLatency: 0,
            memoryUsage: 0
        };
    }
    
    async runTest() {
        console.log(chalk.bold.cyan('\n🧪 Simplified Performance Test\n'));
        
        try {
            // Step 1: Setup
            console.log(chalk.yellow('1. Setting up test environment...'));
            await this.setupEnvironment();
            
            // Step 2: Create repositories
            console.log(chalk.yellow('2. Creating test repositories...'));
            await this.createRepositories();
            
            // Step 3: Run performance tests
            console.log(chalk.yellow('3. Running performance tests...'));
            await this.runPerformanceTests();
            
            // Step 4: Validate results
            console.log(chalk.yellow('4. Validating performance...'));
            const validation = this.validatePerformance();
            
            // Step 5: Generate report
            this.generateReport(validation);
            
            return validation.passed;
            
        } catch (error) {
            console.error(chalk.red('Test failed:'), error);
            return false;
        } finally {
            await this.cleanup();
        }
    }
    
    async setupEnvironment() {
        if (fs.existsSync(this.config.baseTestPath)) {
            await execAsync(`rm -rf ${this.config.baseTestPath}`);
        }
        fs.mkdirSync(this.config.baseTestPath, { recursive: true });
        logger.info('Environment ready', { path: this.config.baseTestPath });
    }
    
    async createRepositories() {
        const repoConfigs = [
            { name: 'repo-small', size: 5 },
            { name: 'repo-medium', size: 10 },
            { name: 'repo-large', size: 15 }
        ];
        
        for (const config of repoConfigs) {
            const repoPath = path.join(this.config.baseTestPath, config.name);
            await this.createRepository(repoPath, config);
            this.testRepos.push({
                path: repoPath,
                name: config.name,
                size: config.size,
                commits: 0,
                errors: 0
            });
        }
        
        logger.info('Repositories created', { count: this.testRepos.length });
    }
    
    async createRepository(repoPath, config) {
        fs.mkdirSync(repoPath, { recursive: true });
        
        // Initialize git
        await execAsync('git init', { cwd: repoPath });
        await execAsync('git config user.email "test@devmind.ai"', { cwd: repoPath });
        await execAsync('git config user.name "Perf Test"', { cwd: repoPath });
        
        // Create initial files
        for (let i = 0; i < config.size; i++) {
            const fileName = `file-${i}.js`;
            const content = `// File ${i}\nconst value = ${i};\nexport default value;`;
            fs.writeFileSync(path.join(repoPath, fileName), content);
        }
        
        // Initial commit
        await execAsync('git add .', { cwd: repoPath });
        await execAsync('git commit -m "Initial commit"', { cwd: repoPath });
        
        logger.info('Repository created', { name: config.name, files: config.size });
    }
    
    async runPerformanceTests() {
        for (const repo of this.testRepos) {
            console.log(chalk.gray(`  Testing ${repo.name}...`));
            
            // Ensure shadow branch
            this.performanceMonitor.startOperation(`shadow-${repo.name}`, {
                type: 'shadow-branch',
                repository: repo.path
            });
            
            try {
                const { shadowBranch } = await this.shadowBranchManager.ensureShadowBranch(repo.path);
                repo.shadowBranch = shadowBranch;
                
                this.performanceMonitor.endOperation(`shadow-${repo.name}`, {
                    success: true
                });
                
                // Make changes and commit
                for (let i = 0; i < this.config.changesPerRepo; i++) {
                    await this.makeChangeAndCommit(repo, i);
                    
                    // Small delay to avoid overwhelming the system
                    await this.sleep(100);
                }
                
            } catch (error) {
                this.performanceMonitor.endOperation(`shadow-${repo.name}`, {
                    error: error.message
                });
                repo.errors++;
                this.results.totalErrors++;
                logger.error('Test failed for repo', { repo: repo.name, error: error.message });
            }
        }
    }
    
    async makeChangeAndCommit(repo, changeIndex) {
        const operationId = `commit-${repo.name}-${changeIndex}`;
        
        this.performanceMonitor.startOperation(operationId, {
            type: 'commit',
            repository: repo.path,
            change: changeIndex
        });
        
        try {
            // Switch to shadow branch
            await this.shadowBranchManager.switchToShadowBranch(repo.path, repo.shadowBranch);
            
            // Make a change
            const fileName = `change-${changeIndex}.js`;
            const filePath = path.join(repo.path, fileName);
            const content = `// Change ${changeIndex} at ${new Date().toISOString()}\nexport const change = ${Math.random()};`;
            fs.writeFileSync(filePath, content);
            
            // Commit the change
            const message = `Auto-commit: Change ${changeIndex} for performance test`;
            const result = await this.shadowBranchManager.commitToShadowBranch(
                repo.path,
                repo.shadowBranch,
                message,
                [fileName]
            );
            
            // Restore original branch
            await this.shadowBranchManager.restoreOriginalBranch(repo.path);
            
            repo.commits++;
            this.results.totalCommits++;
            
            this.performanceMonitor.endOperation(operationId, {
                success: true,
                commitHash: result.commitHash
            });
            
        } catch (error) {
            this.performanceMonitor.endOperation(operationId, {
                error: error.message
            });
            repo.errors++;
            this.results.totalErrors++;
            throw error;
        }
    }
    
    validatePerformance() {
        const validation = this.performanceMonitor.validatePerformance();
        const report = this.performanceMonitor.getReport();
        
        this.results.averageLatency = validation.globalMetrics.averageLatency;
        this.results.memoryUsage = validation.globalMetrics.memoryPerRepo;
        
        // Store repository results
        for (const repo of this.testRepos) {
            this.results.repositories.push({
                name: repo.name,
                commits: repo.commits,
                errors: repo.errors,
                successRate: repo.commits > 0 ? 
                    ((repo.commits / (repo.commits + repo.errors)) * 100).toFixed(1) : 0
            });
        }
        
        return {
            passed: validation.passed,
            metrics: validation.globalMetrics,
            targets: {
                latency: validation.meetsLatencyTarget,
                memory: validation.meetsMemoryTarget,
                p95: validation.meetsP95Target
            },
            report
        };
    }
    
    generateReport(validation) {
        console.log('\n' + chalk.bold.blue('═══════════════════════════════════════════════════════'));
        console.log(chalk.bold.blue('       Simplified Performance Validation Report'));
        console.log(chalk.bold.blue('═══════════════════════════════════════════════════════'));
        
        console.log('\n' + chalk.bold('Test Summary:'));
        console.log(`  • Repositories Tested: ${this.config.testRepoCount}`);
        console.log(`  • Total Commits: ${this.results.totalCommits}`);
        console.log(`  • Total Errors: ${this.results.totalErrors}`);
        console.log(`  • Success Rate: ${((this.results.totalCommits / (this.results.totalCommits + this.results.totalErrors)) * 100).toFixed(1)}%`);
        
        console.log('\n' + chalk.bold('Performance Metrics:'));
        console.log(`  • Average Latency: ${chalk.cyan(this.results.averageLatency.toFixed(2) + 'ms')}`);
        console.log(`  • Memory per Repository: ${chalk.cyan(this.results.memoryUsage.toFixed(2) + 'MB')}`);
        console.log(`  • P95 Latency: ${chalk.cyan((validation.report.performance.p95CommitLatency || 0).toFixed(2) + 'ms')}`);
        
        console.log('\n' + chalk.bold('Target Validation:'));
        const targets = [
            { name: 'Latency < 100ms', passed: validation.targets.latency },
            { name: 'Memory < 50MB/repo', passed: validation.targets.memory },
            { name: 'P95 < 150ms', passed: validation.targets.p95 }
        ];
        
        targets.forEach(target => {
            const icon = target.passed ? chalk.green('✓') : chalk.red('✗');
            const status = target.passed ? chalk.green('PASS') : chalk.red('FAIL');
            console.log(`  ${icon} ${target.name}: ${status}`);
        });
        
        console.log('\n' + chalk.bold('Repository Performance:'));
        this.results.repositories.forEach(repo => {
            console.log(`  • ${repo.name}:`);
            console.log(`    - Commits: ${repo.commits}`);
            console.log(`    - Errors: ${repo.errors}`);
            console.log(`    - Success Rate: ${repo.successRate}%`);
        });
        
        console.log('\n' + chalk.bold('Overall Result:'));
        if (validation.passed) {
            console.log(chalk.green.bold('  ✓ PERFORMANCE VALIDATION PASSED'));
            console.log(chalk.green('  System meets core performance targets'));
        } else {
            console.log(chalk.red.bold('  ✗ PERFORMANCE VALIDATION FAILED'));
            console.log(chalk.red('  System does not meet all performance targets'));
        }
        
        console.log('\n' + chalk.bold.blue('═══════════════════════════════════════════════════════'));
    }
    
    async cleanup() {
        try {
            this.performanceMonitor.stop();
            
            if (process.env.KEEP_TEST_REPOS !== 'true') {
                logger.info('Cleaning up test repositories');
                await execAsync(`rm -rf ${this.config.baseTestPath}`);
            }
        } catch (error) {
            logger.error('Cleanup error', error);
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    const test = new SimplifiedPerformanceTest();
    test.runTest()
        .then(passed => {
            process.exit(passed ? 0 : 1);
        })
        .catch(error => {
            console.error(chalk.red('Fatal error:'), error);
            process.exit(1);
        });
}

export default SimplifiedPerformanceTest;