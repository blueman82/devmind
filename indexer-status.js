#!/usr/bin/env node

/**
 * Quick indexer status check - shows current state without monitoring
 */

import DatabaseManager from './src/database/database-manager.js';

console.log('📊 AI Memory App - Indexer Status\n');

try {
    const dbManager = new DatabaseManager();
    await dbManager.initialize();
    
    // Get database statistics
    console.log('💾 Database Status:');
    const stats = dbManager.getStats();
    
    // Count records
    const convCount = dbManager.db.prepare('SELECT COUNT(*) as count FROM conversations').get();
    const msgCount = dbManager.db.prepare('SELECT COUNT(*) as count FROM messages').get();
    const ftsCount = dbManager.db.prepare('SELECT COUNT(*) as count FROM messages_fts').get();
    
    console.log(`   📚 Conversations: ${convCount.count.toLocaleString()}`);
    console.log(`   💬 Messages: ${msgCount.count.toLocaleString()}`);
    console.log(`   🔍 FTS5 Entries: ${ftsCount.count.toLocaleString()}`);
    
    // Recent activity
    const recentConvs = dbManager.db.prepare(`
        SELECT COUNT(*) as count FROM conversations 
        WHERE created_at > datetime('now', '-24 hours')
    `).get();
    
    const recentMsgs = dbManager.db.prepare(`
        SELECT COUNT(*) as count FROM messages 
        WHERE timestamp > datetime('now', '-24 hours')
    `).get();
    
    console.log(`   📈 Last 24h: ${recentConvs.count} conversations, ${recentMsgs.count} messages`);
    
    // Index timestamps
    console.log('\n⏰ Indexing Activity:');
    console.log(`   Last Full Index: ${stats.last_full_index || 'never'}`);
    console.log(`   Last Incremental: ${stats.last_incremental_index || 'never'}`);
    
    // Test search performance
    console.log('\n⚡ Performance Test:');
    const startTime = Date.now();
    const testResults = dbManager.searchConversations('database', { limit: 5 });
    const searchTime = Date.now() - startTime;
    console.log(`   Search Time: ${searchTime}ms`);
    console.log(`   Test Results: ${testResults.length} found`);
    
    // Show recent conversations
    if (convCount.count > 0) {
        console.log('\n📋 Recent Conversations:');
        const recent = dbManager.db.prepare(`
            SELECT session_id, project_name, created_at, message_count 
            FROM conversations 
            ORDER BY created_at DESC 
            LIMIT 5
        `).all();
        
        recent.forEach((conv, i) => {
            const date = new Date(conv.created_at).toLocaleDateString();
            const project = conv.project_name || 'Unknown';
            console.log(`   ${i + 1}. ${project} (${conv.message_count} msgs) - ${date}`);
        });
    }
    
    // Database file info
    const fs = await import('fs');
    const dbPath = dbManager.dbPath;
    try {
        const stats = await fs.promises.stat(dbPath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`\n💿 Database File: ${sizeMB} MB at ${dbPath}`);
    } catch {
        console.log(`\n💿 Database File: Not found at ${dbPath}`);
    }
    
    console.log('\n✅ Status check complete');
    
    dbManager.close();
    
} catch (error) {
    console.error('❌ Error checking status:', error.message);
    process.exit(1);
}