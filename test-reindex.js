#!/usr/bin/env node

/**
 * Test re-indexing a single conversation to verify project name fix
 */

import ConversationParser from './src/parser/conversation-parser.js';
import DatabaseManager from './src/database/database-manager.js';
import path from 'path';

const testFile = '/Users/harrison/.claude/projects/-Users-harrison-Documents-Github-devmind/4100019a-b145-4197-bddb-f24b7617bff2.jsonl';

console.log('🧪 Testing project name fix with single file re-index\n');

try {
    const dbManager = new DatabaseManager();
    await dbManager.initialize();
    
    const parser = new ConversationParser();
    
    console.log(`📁 Testing file: ${path.basename(testFile)}`);
    
    const conversations = await parser.parseJsonlFile(testFile);
    console.log(`✅ Parsed ${conversations.length} conversation(s)`);
    
    for (const conv of conversations) {
        console.log(`📊 Conversation details:`);
        console.log(`   Session ID: ${conv.session_id}`);
        console.log(`   Project Name: ${conv.project_name || 'null'}`);
        console.log(`   Project Path: ${conv.project_path || 'null'}`);
        console.log(`   Messages: ${conv.messages?.length || 0}`);
        console.log(`   Message Count: ${conv.message_count}`);
        console.log(`📋 Full object keys:`, Object.keys(conv));
        
        // Update/insert the conversation
        const result = await dbManager.upsertConversation(conv);
        console.log(`💾 Database result: ${result.changes} changes`);
    }
    
    // Check what's now in the database for this session
    const sessionId = path.basename(testFile, '.jsonl');
    const dbConv = dbManager.db.prepare(`
        SELECT session_id, project_name, project_path, message_count 
        FROM conversations 
        WHERE session_id = ?
    `).get(sessionId);
    
    console.log(`\n🔍 Database record:`);
    console.log(`   Project Name: ${dbConv?.project_name || 'null'}`);
    console.log(`   Message Count: ${dbConv?.message_count || 0}`);
    
    dbManager.close();
    console.log('\n✅ Test complete');
    
} catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
}