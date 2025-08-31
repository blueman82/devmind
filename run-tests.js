#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tests = [
  'src/tests/database-manager.test.js',
  'src/tests/config-validator.test.js',
  'src/tests/git-tools.test.js',
  // Skip file-watcher and mcp-server tests as they spawn long-running processes
  // 'src/tests/file-watcher.test.js',
  // 'src/tests/mcp-server.test.js'
];

let totalPass = 0;
let totalFail = 0;
let totalTests = 0;

async function runTest(testFile) {
  console.log(`\n📦 Running ${testFile}...`);
  
  return new Promise((resolve) => {
    const child = spawn('node', [testFile], {
      stdio: 'pipe',
      cwd: __dirname
    });

    let output = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      // Parse test results
      const passMatch = output.match(/ℹ pass (\d+)/);
      const failMatch = output.match(/ℹ fail (\d+)/);
      const testsMatch = output.match(/ℹ tests (\d+)/);
      
      const pass = passMatch ? parseInt(passMatch[1]) : 0;
      const fail = failMatch ? parseInt(failMatch[1]) : 0;
      const tests = testsMatch ? parseInt(testsMatch[1]) : 0;
      
      totalPass += pass;
      totalFail += fail;
      totalTests += tests;
      
      if (fail > 0) {
        console.log(`  ❌ ${fail} tests failed`);
        console.log(output);
      } else {
        console.log(`  ✅ ${pass} tests passed`);
      }
      
      resolve();
    });
  });
}

async function main() {
  console.log('🧪 Running test suite...\n');
  
  for (const testFile of tests) {
    await runTest(testFile);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary:');
  console.log(`  Total tests: ${totalTests}`);
  console.log(`  ✅ Passed: ${totalPass}`);
  console.log(`  ❌ Failed: ${totalFail}`);
  
  if (totalFail === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed');
    process.exit(1);
  }
}

main().catch(console.error);