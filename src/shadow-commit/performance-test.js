#!/usr/bin/env node

/**
 * Performance Testing Harness for Multi-Repository Auto-Commit System
 * Phase 2c Priority 3 - Performance Validation
 * 
 * This script:
 * 1. Creates 10+ test repositories with varied content
 * 2. Simulates concurrent file changes
 * 3. Measures performance metrics
 * 4. Validates against performance targets
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import PerformanceMonitor from './performance-monitor.js';
import AutoCommitService from './auto-commit-service.js';
import { createLogger } from '../utils/logger.js';
import chalk from 'chalk';
import ora from 'ora';

const execAsync = promisify(exec);
const logger = createLogger('PerformanceTest');

class PerformanceTestHarness {
    constructor(options = {}) {
        this.config = {
            testRepoCount: options.testRepoCount || 10,
            filesPerRepo: options.filesPerRepo || 20,
            changesPerTest: options.changesPerTest || 50,
            testDuration: options.testDuration || 60000, // 1 minute
            baseTestPath: options.baseTestPath || '/tmp/devmind-perf-test',
            ...options
        };
        
        this.performanceMonitor = new PerformanceMonitor();
        this.autoCommitService = null;
        this.testRepos = [];
        this.testResults = {
            startTime: null,
            endTime: null,
            repositoriesCreated: 0,
            totalFileChanges: 0,
            totalCommits: 0,
            errors: [],
            performanceValidation: null
        };
    }
    
    /**
     * Run the complete performance test suite
     */
    async runTests() {
        const spinner = ora('Starting performance test harness...').start();
        
        try {
            // Phase 1: Setup
            spinner.text = 'Creating test environment...';
            await this.setupTestEnvironment();
            
            // Phase 2: Create test repositories
            spinner.text = `Creating ${this.config.testRepoCount} test repositories...`;
            await this.createTestRepositories();
            
            // Phase 3: Initialize auto-commit service
            spinner.text = 'Initializing auto-commit service...';
            await this.initializeAutoCommitService();
            
            // Phase 4: Run performance tests
            spinner.text = 'Running performance tests...';
            this.testResults.startTime = Date.now();
            await this.runPerformanceTests();
            this.testResults.endTime = Date.now();
            
            // Phase 5: Validate results
            spinner.text = 'Validating performance metrics...';
            const validation = await this.validatePerformance();
            
            // Phase 6: Generate report
            spinner.succeed('Performance tests completed');
            await this.generateReport(validation);
            
            return validation;
            
        } catch (error) {
            spinner.fail('Performance test failed');
            logger.error('Test harness error', error);
            this.testResults.errors.push(error.message);
            throw error;
        } finally {
            await this.cleanup();
        }
    }
    
    /**
     * Setup test environment
     */
    async setupTestEnvironment() {
        // Create base test directory
        if (fs.existsSync(this.config.baseTestPath)) {
            await execAsync(`rm -rf ${this.config.baseTestPath}`);
        }
        fs.mkdirSync(this.config.baseTestPath, { recursive: true });
        
        logger.info('Test environment created', { path: this.config.baseTestPath });
    }
    
    /**
     * Create test repositories with varied characteristics
     */
    async createTestRepositories() {
        const repoTypes = [
            { name: 'small-js', language: 'javascript', size: 'small' },
            { name: 'medium-python', language: 'python', size: 'medium' },
            { name: 'large-mixed', language: 'mixed', size: 'large' },
            { name: 'monorepo', language: 'javascript', size: 'large', subdirs: 5 },
            { name: 'documentation', language: 'markdown', size: 'medium' },
            { name: 'config-heavy', language: 'json', size: 'small' },
            { name: 'binary-assets', language: 'mixed', size: 'large', binary: true },
            { name: 'deep-nested', language: 'javascript', size: 'medium', depth: 5 },
            { name: 'many-branches', language: 'python', size: 'small', branches: 5 },
            { name: 'rapid-changes', language: 'javascript', size: 'small' }
        ];
        
        // Create additional repos if needed
        while (repoTypes.length < this.config.testRepoCount) {
            repoTypes.push({
                name: `test-repo-${repoTypes.length + 1}`,
                language: 'javascript',
                size: 'medium'
            });
        }
        
        for (let i = 0; i < this.config.testRepoCount; i++) {
            const repoConfig = repoTypes[i] || repoTypes[0];
            const repoPath = path.join(this.config.baseTestPath, repoConfig.name);
            
            await this.createTestRepository(repoPath, repoConfig);
            this.testRepos.push({
                path: repoPath,
                config: repoConfig,
                filesCreated: 0,
                commitsCreated: 0
            });
            
            this.testResults.repositoriesCreated++;
        }
        
        logger.info('Test repositories created', { 
            count: this.testResults.repositoriesCreated,
            repos: this.testRepos.map(r => r.config.name)
        });
    }
    
    /**
     * Create a single test repository
     */
    async createTestRepository(repoPath, config) {
        fs.mkdirSync(repoPath, { recursive: true });
        
        // Initialize git repository
        await execAsync('git init', { cwd: repoPath });
        await execAsync('git config user.email "test@devmind.ai"', { cwd: repoPath });
        await execAsync('git config user.name "Performance Test"', { cwd: repoPath });
        
        // Create files based on configuration
        const fileCount = this.getFileCount(config.size);
        await this.createTestFiles(repoPath, config, fileCount);
        
        // Create initial commit
        await execAsync('git add .', { cwd: repoPath });
        await execAsync('git commit -m "Initial test repository setup"', { cwd: repoPath });
        
        // Create additional branches if specified
        if (config.branches) {
            for (let i = 1; i <= config.branches; i++) {
                await execAsync(`git checkout -b feature-${i}`, { cwd: repoPath });
                await this.createTestFiles(repoPath, config, 2); // Add some files to each branch
                await execAsync('git add .', { cwd: repoPath });
                await execAsync(`git commit -m "Feature ${i} files"`, { cwd: repoPath });
            }
            await execAsync('git checkout main', { cwd: repoPath });
        }
        
        // Create subdirectories for monorepo
        if (config.subdirs) {
            for (let i = 1; i <= config.subdirs; i++) {
                const subdir = path.join(repoPath, `package-${i}`);
                fs.mkdirSync(subdir, { recursive: true });
                await this.createTestFiles(subdir, config, 3);
            }
        }
    }
    
    /**
     * Get file count based on repository size
     */
    getFileCount(size) {
        switch (size) {
            case 'small': return 10;
            case 'medium': return 25;
            case 'large': return 50;
            default: return 20;
        }
    }
    
    /**
     * Create test files in a repository
     */
    async createTestFiles(basePath, config, count) {
        const extensions = {
            javascript: '.js',
            python: '.py',
            markdown: '.md',
            json: '.json',
            mixed: ['.js', '.py', '.md', '.json', '.txt']
        };
        
        const ext = extensions[config.language] || '.txt';
        
        for (let i = 0; i < count; i++) {
            const fileExt = Array.isArray(ext) ? ext[i % ext.length] : ext;
            const fileName = `file-${Date.now()}-${i}${fileExt}`;
            const filePath = path.join(basePath, fileName);
            
            const content = this.generateFileContent(config.language, i);
            fs.writeFileSync(filePath, content);
        }
        
        // Create binary files if specified
        if (config.binary) {
            for (let i = 0; i < 3; i++) {
                const binaryPath = path.join(basePath, `asset-${i}.bin`);
                const buffer = Buffer.alloc(1024 * 10); // 10KB binary files
                fs.writeFileSync(binaryPath, buffer);
            }
        }
    }
    
    /**
     * Generate file content based on language
     */
    generateFileContent(language, index) {
        const templates = {
            javascript: `// Test file ${index}
function testFunction${index}() {
    console.log('Performance test ${index}');
    return {
        id: ${index},
        timestamp: Date.now(),
        data: 'test data'
    };
}

module.exports = testFunction${index};`,
            
            python: `# Test file ${index}
def test_function_${index}():
    """Performance test function ${index}"""
    print(f"Performance test ${index}")
    return {
        'id': ${index},
        'timestamp': time.time(),
        'data': 'test data'
    }`,
            
            markdown: `# Test Document ${index}

This is a test markdown file for performance testing.

## Section ${index}
- Item 1
- Item 2
- Item 3

### Performance Metrics
Testing auto-commit performance with multiple repositories.`,
            
            json: JSON.stringify({
                id: index,
                name: `test-${index}`,
                description: 'Performance test data',
                timestamp: Date.now()
            }, null, 2)
        };
        
        return templates[language] || `Test file ${index}\nContent for performance testing`;
    }
    
    /**
     * Initialize auto-commit service with test repositories
     */
    async initializeAutoCommitService() {
        this.autoCommitService = new AutoCommitService({
            performanceMonitor: this.performanceMonitor,
            gitConcurrency: 2,
            fileConcurrency: 5,
            gitOperationsPerSecond: 10,
            fileOperationsPerSecond: 20,
            dbPath: ':memory:', // Use in-memory database for testing
            watcherOptions: {
                ignored: ['node_modules', '.git'],
                persistent: true
            }
        });
        
        // Add all test repositories
        for (const repo of this.testRepos) {
            await this.autoCommitService.addRepository(repo.path, {
                autoCommitEnabled: true,
                throttleSeconds: 2,
                notificationPreference: 'disabled'
            });
        }
        
        await this.autoCommitService.start();
        
        logger.info('Auto-commit service initialized', {
            repositories: this.testRepos.length,
            concurrency: {
                git: 2,
                file: 5
            }
        });
    }
    
    /**
     * Run performance tests
     */
    async runPerformanceTests() {
        const testScenarios = [
            { name: 'Sequential Changes', type: 'sequential' },
            { name: 'Concurrent Changes', type: 'concurrent' },
            { name: 'Burst Changes', type: 'burst' },
            { name: 'Sustained Load', type: 'sustained' }
        ];
        
        for (const scenario of testScenarios) {
            logger.info(`Running scenario: ${scenario.name}`);
            
            this.performanceMonitor.startOperation(`scenario-${scenario.name}`, {
                type: 'test-scenario',
                scenario: scenario.name
            });
            
            await this.runTestScenario(scenario);
            
            this.performanceMonitor.endOperation(`scenario-${scenario.name}`, {
                success: true
            });
            
            // Wait between scenarios
            await this.sleep(2000);
        }
    }
    
    /**
     * Run a specific test scenario
     */
    async runTestScenario(scenario) {
        switch (scenario.type) {
            case 'sequential':
                await this.runSequentialChanges();
                break;
            case 'concurrent':
                await this.runConcurrentChanges();
                break;
            case 'burst':
                await this.runBurstChanges();
                break;
            case 'sustained':
                await this.runSustainedLoad();
                break;
        }
    }
    
    /**
     * Sequential changes across repositories
     */
    async runSequentialChanges() {
        for (const repo of this.testRepos) {
            for (let i = 0; i < 5; i++) {
                await this.makeFileChange(repo);
                await this.sleep(100);
            }
        }
    }
    
    /**
     * Concurrent changes across all repositories
     */
    async runConcurrentChanges() {
        const promises = [];
        
        for (const repo of this.testRepos) {
            for (let i = 0; i < 5; i++) {
                promises.push(this.makeFileChange(repo));
            }
        }
        
        await Promise.all(promises);
    }
    
    /**
     * Burst of changes to stress test the system
     */
    async runBurstChanges() {
        const burstCount = 100;
        const promises = [];
        
        for (let i = 0; i < burstCount; i++) {
            const repo = this.testRepos[i % this.testRepos.length];
            promises.push(this.makeFileChange(repo));
        }
        
        await Promise.all(promises);
    }
    
    /**
     * Sustained load over time
     */
    async runSustainedLoad() {
        const duration = 10000; // 10 seconds
        const startTime = Date.now();
        
        while (Date.now() - startTime < duration) {
            const repo = this.testRepos[Math.floor(Math.random() * this.testRepos.length)];
            this.makeFileChange(repo); // Don't await, let them run concurrently
            await this.sleep(50); // Small delay between initiations
        }
        
        // Wait for all changes to complete
        await this.sleep(2000);
    }
    
    /**
     * Make a file change in a repository
     */
    async makeFileChange(repo) {
        const fileName = `test-change-${Date.now()}-${Math.random()}.js`;
        const filePath = path.join(repo.path, fileName);
        
        const content = `// Changed at ${new Date().toISOString()}
function change() {
    return ${Math.random()};
}`;
        
        fs.writeFileSync(filePath, content);
        repo.filesCreated++;
        this.testResults.totalFileChanges++;
        
        return filePath;
    }
    
    /**
     * Validate performance against targets
     */
    async validatePerformance() {
        // Wait for all pending operations to complete
        await this.sleep(3000);
        
        const validation = this.performanceMonitor.validatePerformance();
        const report = this.performanceMonitor.getReport();
        
        this.testResults.performanceValidation = validation;
        this.testResults.totalCommits = report.global.totalCommits;
        
        return {
            validation,
            report,
            testResults: this.testResults,
            success: validation.passed
        };
    }
    
    /**
     * Generate performance report
     */
    async generateReport(results) {
        const { validation, report, testResults } = results;
        
        console.log('\n' + chalk.bold.blue('═══════════════════════════════════════════════════════'));
        console.log(chalk.bold.blue('          Performance Validation Report'));
        console.log(chalk.bold.blue('═══════════════════════════════════════════════════════'));
        
        console.log('\n' + chalk.bold('Test Configuration:'));
        console.log(`  • Repositories: ${this.config.testRepoCount}`);
        console.log(`  • Test Duration: ${(testResults.endTime - testResults.startTime) / 1000}s`);
        console.log(`  • Total File Changes: ${testResults.totalFileChanges}`);
        console.log(`  • Total Commits: ${testResults.totalCommits}`);
        
        console.log('\n' + chalk.bold('Performance Metrics:'));
        console.log(`  • Average Commit Latency: ${chalk.cyan(validation.globalMetrics.averageLatency.toFixed(2) + 'ms')}`);
        console.log(`  • P95 Commit Latency: ${chalk.cyan(report.performance.p95CommitLatency.toFixed(2) + 'ms')}`);
        console.log(`  • P99 Commit Latency: ${chalk.cyan(report.performance.p99CommitLatency.toFixed(2) + 'ms')}`);
        console.log(`  • Memory Per Repository: ${chalk.cyan(validation.globalMetrics.memoryPerRepo.toFixed(2) + 'MB')}`);
        console.log(`  • Peak Memory Usage: ${chalk.cyan(report.global.peakMemoryUsage.toFixed(2) + 'MB')}`);
        console.log(`  • Error Rate: ${chalk.cyan((validation.globalMetrics.errorRate * 100).toFixed(2) + '%')}`);
        
        console.log('\n' + chalk.bold('Performance Targets:'));
        const targets = [
            {
                name: 'Latency Target (<100ms)',
                passed: validation.meetsLatencyTarget,
                value: validation.globalMetrics.averageLatency.toFixed(2) + 'ms'
            },
            {
                name: 'Memory Target (<50MB/repo)',
                passed: validation.meetsMemoryTarget,
                value: validation.globalMetrics.memoryPerRepo.toFixed(2) + 'MB'
            },
            {
                name: 'P95 Target (<150ms)',
                passed: validation.meetsP95Target,
                value: report.performance.p95CommitLatency.toFixed(2) + 'ms'
            }
        ];
        
        targets.forEach(target => {
            const icon = target.passed ? chalk.green('✓') : chalk.red('✗');
            const status = target.passed ? chalk.green('PASS') : chalk.red('FAIL');
            console.log(`  ${icon} ${target.name}: ${status} (${target.value})`);
        });
        
        console.log('\n' + chalk.bold('Repository Performance:'));
        for (const [repoName, metrics] of Object.entries(report.repositories)) {
            const shortName = path.basename(repoName);
            console.log(`  • ${shortName}:`);
            console.log(`    - Commits: ${metrics.totalCommits}`);
            console.log(`    - Avg Latency: ${metrics.averageLatency.toFixed(2)}ms`);
            console.log(`    - Peak Latency: ${metrics.peakLatency.toFixed(2)}ms`);
        }
        
        console.log('\n' + chalk.bold('Overall Result:'));
        if (validation.passed) {
            console.log(chalk.green.bold('  ✓ PERFORMANCE VALIDATION PASSED'));
            console.log(chalk.green('  System meets all performance targets for 10+ repositories'));
        } else {
            console.log(chalk.red.bold('  ✗ PERFORMANCE VALIDATION FAILED'));
            console.log(chalk.red('  System does not meet all performance targets'));
        }
        
        console.log('\n' + chalk.bold.blue('═══════════════════════════════════════════════════════'));
        
        // Save report to file
        const reportPath = path.join(this.config.baseTestPath, 'performance-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
        console.log(`\n${chalk.gray('Full report saved to:')} ${reportPath}`);
    }
    
    /**
     * Cleanup test environment
     */
    async cleanup() {
        try {
            if (this.autoCommitService) {
                await this.autoCommitService.stop();
            }
            
            this.performanceMonitor.stop();
            
            // Optionally remove test repositories
            if (process.env.CLEANUP_TEST_REPOS !== 'false') {
                logger.info('Cleaning up test repositories...');
                await execAsync(`rm -rf ${this.config.baseTestPath}`);
            }
        } catch (error) {
            logger.error('Cleanup error', error);
        }
    }
    
    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const testHarness = new PerformanceTestHarness({
        testRepoCount: parseInt(process.argv[2]) || 10,
        testDuration: parseInt(process.argv[3]) || 60000
    });
    
    console.log(chalk.bold.cyan('\n🚀 DevMind Performance Test Harness\n'));
    
    testHarness.runTests()
        .then(results => {
            process.exit(results.success ? 0 : 1);
        })
        .catch(error => {
            console.error(chalk.red('Test harness failed:'), error);
            process.exit(1);
        });
}

export default PerformanceTestHarness;