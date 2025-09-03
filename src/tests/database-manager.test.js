import { test, describe, expect } from 'vitest';
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
    expect(result).toBe(true); // Database should initialize successfully
    expect(dbManager.isInitialized).toBe(true); // Database should be marked as initialized
    
    // Check if tables exist
    const tables = dbManager.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
    `).all();
    
    const tableNames = tables.map(t => t.name);
    expect(tableNames.includes('conversations')).toBeTruthy(); // conversations table should exist
    expect(tableNames.includes('messages')).toBeTruthy(); // messages table should exist
    expect(tableNames.includes('messages_fts')).toBeTruthy(); // messages_fts FTS5 table should exist
    expect(tableNames.includes('index_stats')).toBeTruthy(); // index_stats table should exist
    
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
    expect(result.lastInsertRowid).toBeTruthy(); // Should return insert row ID
    console.log('✅ Conversation inserted with ID:', result.lastInsertRowid);

    // Retrieve conversation
    const retrieved = dbManager.db.prepare(`
      SELECT * FROM conversations WHERE session_id = ?
    `).get('test-session-123');

    expect(retrieved).toBeTruthy(); // Should retrieve conversation
    expect(retrieved.session_id).toBe('test-session-123');
    expect(retrieved.project_name).toBe('Test Project');
    expect(retrieved.message_count).toBe(3);
    
    const topics = JSON.parse(retrieved.topics);
    expect(topics).toEqual(['authentication', 'database']);
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
    
    expect(messageCount).toBe(3); // Should have 3 messages

    // Test FTS5 indexing - wait a moment for triggers to execute
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const ftsCount = dbManager.db.prepare(`
      SELECT COUNT(*) as count FROM messages_fts
    `).get().count;
    
    expect(ftsCount).toBe(3); // FTS5 table should have 3 entries
    console.log('✅ FTS5 indexing working');
  });

  test('test FTS5 search functionality', async () => {
    // Search for authentication-related content
    const results = dbManager.searchConversations('authentication', {
      limit: 10,
      searchMode: 'mixed'
    });

    expect(results.length).toBeGreaterThan(0); // Should find authentication-related conversations
    expect(results[0].snippet).toBeTruthy(); // Should include search snippets
    expect(results[0].relevance_score).toBeTruthy(); // Should include relevance scores
    
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

    expect(sqliteResults.length).toBeGreaterThan(0); // Should find SQLite-related content
    console.log('✅ Specific search found', sqliteResults.length, 'results');
  });

  test('test conversation context retrieval with pagination', async () => {
    const context = dbManager.getConversationContext('test-session-123', {
      page: 1,
      pageSize: 2,
      maxTokens: 1000,
      summaryMode: 'full'
    });

    expect(context).toBeTruthy(); // Should retrieve conversation context
    expect(context.conversation).toBeTruthy(); // Should have conversation metadata
    expect(context.messages).toBeTruthy(); // Should have messages array
    expect(context.pagination).toBeTruthy(); // Should have pagination info

    expect(context.conversation.session_id).toBe('test-session-123');
    expect(context.messages.length).toBe(2); // Should return 2 messages per page
    expect(context.pagination.page).toBe(1); // Should be page 1
    
    console.log('✅ Context retrieval with pagination working');
    console.log('Pagination:', context.pagination);
  });

  test('test statistics tracking', async () => {
    // Update some stats
    await dbManager.updateStats('test_stat', 'test_value');
    await dbManager.updateStats('total_conversations', '1');
    
    const stats = dbManager.getStats();
    expect(stats).toBeTruthy(); // Should retrieve stats
    expect(stats.test_stat).toBe('test_value');
    expect(stats.total_conversations).toBe('1');
    
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
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.message.includes('NOT NULL')).toBeTruthy(); // Should get constraint error
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