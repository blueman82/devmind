#!/usr/bin/env node

/**
 * Test script for Phase 2 Auto-Commit Service
 * Quick testing utility for development
 */

import path from 'path';
import AutoCommitService from './src/shadow-commit/auto-commit-service.js';

async function test() {
    console.log('🚀 Testing Auto-Commit Service\n');
    
    const service = new AutoCommitService({
        enabled: true,
        autoDetectRepos: true,
        claudeProjectsPath: path.join(process.env.HOME, '.claude', 'projects')
    });
    
    try {
        // Start the service
        console.log('Starting service...');
        await service.start();
        
        // Get repository list
        const repos = service.getRepositories();
        console.log(`\n📁 Found ${repos.length} repositories:`);
        repos.forEach(repo => {
            console.log(`  - ${repo.path}`);
        });
        
        // Add current repository if not already added
        const currentRepo = process.cwd();
        if (!repos.find(r => r.path === currentRepo)) {
            console.log(`\nAdding current repository: ${currentRepo}`);
            await service.addRepository(currentRepo);
        }
        
        // Show statistics
        console.log('\n📊 Statistics:');
        const stats = service.getStatistics();
        console.log(`  Active repos: ${stats.repositories}`);
        console.log(`  Total commits: ${stats.totalCommits}`);
        console.log(`  Correlated: ${stats.correlatedCommits}`);
        
        // Keep running for 30 seconds to test file monitoring
        console.log('\n⏱️  Running for 30 seconds. Try saving a file...');
        console.log('Press Ctrl+C to stop\n');
        
        // Set up graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n\nStopping service...');
            await service.stop();
            
            const finalStats = service.getStatistics();
            console.log('\n📈 Final Statistics:');
            console.log(`  Runtime: ${finalStats.runtime}s`);
            console.log(`  Total commits: ${finalStats.totalCommits}`);
            console.log(`  Correlation rate: ${finalStats.correlationRate}`);
            console.log(`  Error rate: ${finalStats.errorRate}`);
            
            process.exit(0);
        });
        
        // Run for 30 seconds then stop
        setTimeout(async () => {
            console.log('\n\nTest completed. Stopping service...');
            await service.stop();
            
            const finalStats = service.getStatistics();
            console.log('\n📈 Final Statistics:');
            console.log(`  Runtime: ${finalStats.runtime}s`);
            console.log(`  Total commits: ${finalStats.totalCommits}`);
            console.log(`  Correlation rate: ${finalStats.correlationRate}`);
            console.log(`  Error rate: ${finalStats.errorRate}`);
            
            process.exit(0);
        }, 30000);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
test().catch(console.error);