#!/usr/bin/env node

// Quick test script to validate git repository discovery fixes
// Tests the critical monorepo scenario with ketchup subdirectory

import GitManager from './src/git/git-manager.js';
import { createLogger } from './src/utils/logger.js';

const logger = createLogger('RepoDiscoveryTest');

async function testRepositoryDiscovery() {
  const gitManager = new GitManager();
  
  console.log('🧪 Testing Git Repository Discovery - Monorepo Fix Validation');
  console.log('=' .repeat(60));
  
  // Test cases
  const testCases = [
    {
      name: 'DevMind Repository (regular repo)',
      path: '/Users/harrison/Documents/Github/devmind'
    },
    {
      name: 'Camp Ops Tools EMEA - Root (monorepo root)', 
      path: '/Users/harrison/Documents/Github/camp-ops-tools-emea'
    },
    {
      name: 'Camp Ops Tools EMEA - Ketchup Subdirectory (CRITICAL TEST)',
      path: '/Users/harrison/Documents/Github/camp-ops-tools-emea/ketchup'
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📁 Testing: ${testCase.name}`);
    console.log(`   Path: ${testCase.path}`);
    
    try {
      const repository = await gitManager.discoverRepository(testCase.path);
      
      if (!repository) {
        console.log('   ❌ No repository discovered');
        continue;
      }
      
      console.log('   ✅ Repository discovered:');
      console.log(`      Repository Root: ${repository.repositoryRoot || repository.gitRoot}`);
      console.log(`      Project Path: ${repository.projectPath || testCase.path}`);
      console.log(`      Subdirectory: ${repository.subdirectoryPath || 'N/A'}`);
      console.log(`      Is Monorepo Subdirectory: ${repository.isMonorepoSubdirectory || false}`);
      console.log(`      Current Branch: ${repository.currentBranch}`);
      console.log(`      Remote URL: ${repository.remoteUrl || 'N/A'}`);
      
      // CRITICAL: Validate monorepo scenario
      if (testCase.path.includes('ketchup')) {
        const expectedRoot = '/Users/harrison/Documents/Github/camp-ops-tools-emea';
        const expectedSubdir = 'ketchup';
        
        const rootMatches = repository.repositoryRoot === expectedRoot;
        const subdirMatches = repository.subdirectoryPath === expectedSubdir;
        const isMonorepoDetected = repository.isMonorepoSubdirectory === true;
        
        console.log(`\n   🔍 Monorepo Validation:`);
        console.log(`      Root correct: ${rootMatches ? '✅' : '❌'} (${repository.repositoryRoot})`);
        console.log(`      Subdir correct: ${subdirMatches ? '✅' : '❌'} (${repository.subdirectoryPath})`);
        console.log(`      Monorepo detected: ${isMonorepoDetected ? '✅' : '❌'}`);
        
        if (rootMatches && subdirMatches && isMonorepoDetected) {
          console.log('   🎉 CRITICAL TEST PASSED - Monorepo limitation FIXED!');
        } else {
          console.log('   🚨 CRITICAL TEST FAILED - Monorepo limitation still exists');
        }
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('🏁 Repository Discovery Test Complete');
}

// Run the test
testRepositoryDiscovery().catch(error => {
  console.error('Test script failed:', error);
  process.exit(1);
});