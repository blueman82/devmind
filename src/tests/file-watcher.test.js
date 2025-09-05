import { test, describe, expect } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileWatcher } from '../indexer/file-watcher.js';

describe('FileWatcher Integration Tests', () => {
  let fileWatcher;
  let tempDir;
  let tempDbPath;

  test('setup test environment', async () => {
    tempDir = join(tmpdir(), `file-watcher-test-${Date.now()}`);
    tempDbPath = join(tmpdir(), `test-watcher-${Date.now()}.db`);
    await fs.mkdir(tempDir, { recursive: true });
    console.log(`Test directory: ${tempDir}`);
  });

  test('FileWatcher initializes correctly', async () => {
    fileWatcher = new FileWatcher({
      claudeProjectsPath: tempDir,
      dbPath: tempDbPath,
      debounceDelay: 100 // Shorter delay for tests
    });

    expect(fileWatcher).toBeTruthy(); // FileWatcher should be created
    expect(fileWatcher.claudeProjectsPath).toBe(tempDir); // Should use provided path
    expect(fileWatcher.isRunning).toBe(false); // Should not be running initially
    console.log('✅ FileWatcher initialized successfully');
  });

  test('FileWatcher starts monitoring', { timeout: 10000 }, async () => {
    await fileWatcher.start();
    expect(fileWatcher.isRunning).toBe(true); // Should be running after start
    console.log('✅ FileWatcher started monitoring');
  });

  test('FileWatcher detects new project directory', { timeout: 15000 }, async () => {
    // Create a project directory structure
    const projectDir = join(tempDir, 'test-project-abc123');
    const conversationFile = join(projectDir, 'conversation.jsonl');
    
    await fs.mkdir(projectDir, { recursive: true });
    
    // Create a test conversation file
    const testConversation = JSON.stringify({
      uuid: '123e4567-e89b-12d3-a456-426614174000',
      type: 'conversation',
      created_at: new Date().toISOString(),
      model: 'claude-3-5-sonnet-20241022',
      content: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello, test conversation' }]
        },
        {
          role: 'assistant', 
          content: [{ type: 'text', text: 'Hello! This is a test response.' }]
        }
      ]
    }) + '\n';

    await fs.writeFile(conversationFile, testConversation);

    // Wait for FileWatcher to detect and process the file
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check if the conversation was indexed
    const dbConversations = fileWatcher.dbManager.db.prepare('SELECT COUNT(*) as count FROM conversations').get();
    expect(dbConversations.count).toBeGreaterThanOrEqual(1); // Should have indexed at least one conversation

    console.log(`✅ FileWatcher detected and indexed conversation (${dbConversations.count} total)`);
  });

  test('FileWatcher provides status information', async () => {
    const status = fileWatcher.getStatus();
    
    expect(typeof status).toBe('object'); // Status should be an object
    expect(typeof status.isRunning).toBe('boolean'); // Should include isRunning status
    expect(Array.isArray(status.watchedDirectories)).toBe(true); // Should include watched directories array
    expect(typeof status.pendingIndexes).toBe('number'); // Should include pending indexes count
    
    console.log('✅ FileWatcher status information verified');
  });

  test('FileWatcher stops monitoring', async () => {
    fileWatcher.stop();
    expect(fileWatcher.isRunning).toBe(false); // Should not be running after stop
    console.log('✅ FileWatcher stopped monitoring');
  });

  test('cleanup test environment', async () => {
    // Close database connection
    if (fileWatcher && fileWatcher.dbManager) {
      fileWatcher.dbManager.close();
    }

    // Clean up test files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.unlink(tempDbPath);
      console.log('✅ Test environment cleaned up');
    } catch {
      // Ignore cleanup errors
      console.log('⚠️  Cleanup completed with warnings');
    }
  });
});