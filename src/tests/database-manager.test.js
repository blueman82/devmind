import { test, describe } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import DatabaseManager from '../database/database-manager.js';

describe('DatabaseManager Tests', () => {
  let dbManager;
  let tempDbPath;

  // Setup before tests
  test('setup test database', async () => {
    tempDbPath = join(tmpdir(), `test-conversations-${Date.now()}.db`);
    dbManager = new DatabaseManager(tempDbPath);
    console.log(`Test database: ${tempDbPath}`);
  });

  test('initialize database and apply schema', async () => {
    const result = await dbManager.initialize();
    assert.strictEqual(result, true, 'Database should initialize successfully');
    assert.strictEqual(dbManager.isInitialized, true, 'Database should be marked as initialized');
    
    // Check if tables exist
    const tables = dbManager.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
    `).all();
    
    const tableNames = tables.map(t => t.name);
    assert.ok(tableNames.includes('conversations'), 'conversations table should exist');
    assert.ok(tableNames.includes('messages'), 'messages table should exist');
    assert.ok(tableNames.includes('messages_fts'), 'messages_fts FTS5 table should exist');
    assert.ok(tableNames.includes('index_stats'), 'index_stats table should exist');
    
    console.log('✅ Database initialized with tables:', tableNames.join(', '));
  });

  test('insert and retrieve conversation', async () => {
    const testConversation = {
      session_id: 'test-session-123',
      project_hash: 'hash-abc',
      project_name: 'Test Project',
      project_path: '/test/project/path',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: 3,
      file_references: ['file1.js', 'file2.js'],
      topics: ['authentication', 'database'],
      keywords: ['login', 'sqlite', 'test'],
      total_tokens: 150
    };

    // Insert conversation
    const result = await dbManager.upsertConversation(testConversation);
    assert.ok(result.lastInsertRowid, 'Should return insert row ID');
    console.log('✅ Conversation inserted with ID:', result.lastInsertRowid);

    // Retrieve conversation
    const retrieved = dbManager.db.prepare(`
      SELECT * FROM conversations WHERE session_id = ?
    `).get('test-session-123');

    assert.ok(retrieved, 'Should retrieve conversation');
    assert.strictEqual(retrieved.session_id, 'test-session-123');
    assert.strictEqual(retrieved.project_name, 'Test Project');
    assert.strictEqual(retrieved.message_count, 3);
    
    const topics = JSON.parse(retrieved.topics);
    assert.deepStrictEqual(topics, ['authentication', 'database']);
    console.log('✅ Conversation retrieved successfully');
  });

  test('insert messages and test FTS5 indexing', async () => {
    const conversationId = dbManager.db.prepare(`
      SELECT id FROM conversations WHERE session_id = ?
    `).get('test-session-123').id;

    const testMessages = [
      {
        conversation_id: conversationId,
        message_index: 0,
        uuid: 'msg-1',
        timestamp: new Date().toISOString(),
        role: 'user',
        content_type: 'text',
        content: 'How do I implement user authentication in my Node.js application?',
        tokens: 50
      },
      {
        conversation_id: conversationId,
        message_index: 1,
        uuid: 'msg-2',
        timestamp: new Date().toISOString(),
        role: 'assistant',
        content_type: 'text',
        content: 'To implement authentication, you can use JWT tokens with bcrypt for password hashing. Here is a complete solution with Express and SQLite database.',
        tokens: 75
      },
      {
        conversation_id: conversationId,
        message_index: 2,
        uuid: 'msg-3',
        timestamp: new Date().toISOString(),
        role: 'user',
        content_type: 'text',
        content: 'Can you show me how to set up the SQLite database schema for users?',
        tokens: 25
      }
    ];

    // Insert messages
    await dbManager.insertMessages(testMessages);
    console.log('✅ Messages inserted');

    // Verify messages were inserted
    const messageCount = dbManager.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?
    `).get(conversationId).count;
    
    assert.strictEqual(messageCount, 3, 'Should have 3 messages');

    // Test FTS5 indexing - wait a moment for triggers to execute
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const ftsCount = dbManager.db.prepare(`
      SELECT COUNT(*) as count FROM messages_fts
    `).get().count;
    
    assert.strictEqual(ftsCount, 3, 'FTS5 table should have 3 entries');
    console.log('✅ FTS5 indexing working');
  });

  test('test FTS5 search functionality', async () => {
    // Search for authentication-related content
    const results = dbManager.searchConversations('authentication', {
      limit: 10,
      searchMode: 'mixed'
    });

    assert.ok(results.length > 0, 'Should find authentication-related conversations');
    assert.ok(results[0].snippet, 'Should include search snippets');
    assert.ok(results[0].relevance_score, 'Should include relevance scores');
    
    console.log('✅ FTS5 search results:', results.length);
    console.log('Sample result:', {
      session_id: results[0].session_id,
      snippet: results[0].snippet,
      relevance_score: results[0].relevance_score
    });

    // Test more specific search
    const sqliteResults = dbManager.searchConversations('SQLite database', {
      limit: 5,
      searchMode: 'exact'
    });

    assert.ok(sqliteResults.length > 0, 'Should find SQLite-related content');
    console.log('✅ Specific search found', sqliteResults.length, 'results');
  });

  test('test conversation context retrieval with pagination', async () => {
    const context = dbManager.getConversationContext('test-session-123', {
      page: 1,
      pageSize: 2,
      maxTokens: 1000,
      summaryMode: 'full'
    });

    assert.ok(context, 'Should retrieve conversation context');
    assert.ok(context.conversation, 'Should have conversation metadata');
    assert.ok(context.messages, 'Should have messages array');
    assert.ok(context.pagination, 'Should have pagination info');

    assert.strictEqual(context.conversation.session_id, 'test-session-123');
    assert.strictEqual(context.messages.length, 2, 'Should return 2 messages per page');
    assert.strictEqual(context.pagination.page, 1, 'Should be page 1');
    
    console.log('✅ Context retrieval with pagination working');
    console.log('Pagination:', context.pagination);
  });

  test('test statistics tracking', async () => {
    // Update some stats
    await dbManager.updateStats('test_stat', 'test_value');
    await dbManager.updateStats('total_conversations', '1');
    
    const stats = dbManager.getStats();
    assert.ok(stats, 'Should retrieve stats');
    assert.strictEqual(stats.test_stat, 'test_value');
    assert.strictEqual(stats.total_conversations, '1');
    
    console.log('✅ Statistics tracking working');
  });

  test('test error handling with invalid data', async () => {
    try {
      // Try to insert message without required conversation_id
      await dbManager.insertMessage({
        message_index: 0,
        content: 'test'
        // missing required fields
      });
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.ok(error.message.includes('NOT NULL'), 'Should get constraint error');
      console.log('✅ Error handling working:', error.message.split('\n')[0]);
    }
  });

  test('cleanup test database', async () => {
    if (dbManager) {
      dbManager.close();
    }
    
    try {
      await fs.unlink(tempDbPath);
      console.log('✅ Test database cleaned up');
    } catch (error) {
      console.log('⚠️ Test database cleanup warning:', error.message);
    }
  });
});

// Run the tests
console.log('🧪 Starting DatabaseManager tests...\n');