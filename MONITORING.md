# AI Memory App - Indexer Monitoring

This document explains how to monitor the indexer progress and database status.

## Quick Status Check

To get a quick snapshot of the indexer status:

```bash
npm run status
```

This shows:
- 📚 **Database Statistics** - Number of conversations, messages, and FTS5 entries
- 📈 **Recent Activity** - Conversations and messages indexed in the last 24 hours  
- ⏰ **Indexing Timestamps** - When last full and incremental indexing occurred
- ⚡ **Performance** - Search response time test
- 📋 **Recent Conversations** - List of 5 most recently indexed conversations
- 💿 **Database File Size** - Location and size of the SQLite database

## Real-time Monitoring Dashboard

To monitor the indexer in real-time:

```bash
npm run monitor
```

This provides a live dashboard that updates every 2 seconds showing:

### FileWatcher Status
- 🔍 **Running Status** - Whether file monitoring is active
- 📁 **Watched Directories** - Number of directories being monitored
- ⏳ **Pending/Active Indexes** - Files waiting to be processed or currently indexing
- 📂 **Directory List** - Which project directories are being watched

### Database Statistics  
- 💾 **Live Counts** - Real-time conversation, message, and FTS5 entry counts
- 📊 **Recent Activity** - Conversations indexed in the current hour
- ⏰ **Index Timestamps** - When indexing operations occurred

### Project Discovery
- 📁 **Monitoring Path** - Where the FileWatcher is looking for projects
- ✅ **Directory Status** - Whether Claude projects directory exists
- 📂 **Project Count** - Number of project directories found
- 📋 **Recent Projects** - List of recently discovered projects

### Performance Metrics
- ⚡ **Search Speed** - Live search response time testing
- 🔍 **Search Results** - Number of results found in test queries

### Interactive Controls

While monitoring, you can press:
- **Ctrl+C** - Stop monitoring and exit
- **r** - Restart the FileWatcher  
- **f** - Perform a full index of all conversations
- **s** - Run a search functionality test

## Database Location

The SQLite database is stored at:
```
~/.claude/ai-memory/conversations.db
```

You can also examine it directly with any SQLite browser or command-line tools.

## Understanding the Status

### Normal Operation
- ✅ FileWatcher Running: YES
- ✅ Watched Directories: 1 or more
- ✅ Database connected with conversation/message counts
- ✅ Search response times < 100ms

### Initial Setup
- 📁 Directory Status: NOT FOUND (until you start using Claude Code)
- 📊 Conversations: 0 (no data indexed yet)
- ⏰ Last Index: never (first time running)

### Active Indexing
- ⏳ Pending Indexes: > 0 (files waiting to be processed)
- 🔄 Active Indexing: > 0 (files currently being processed)
- 📈 Recent Activity: Increasing counts

## Troubleshooting

### FileWatcher Not Running
1. Check if Node.js process has file system permissions
2. Verify the Claude projects directory exists: `~/.claude/projects/`
3. Restart with `npm run monitor` and press 'r'

### No Conversations Found
1. Make sure you've used Claude Code and created some conversations
2. Check that conversations are saved as JSONL files in `~/.claude/projects/`
3. Run a full index with `npm run monitor` and press 'f'

### Search Not Working
1. Verify FTS5 entries count matches message count
2. Check database file size is > 0
3. Look for error messages in the monitoring output

### Performance Issues  
- Search times > 1000ms may indicate database optimization needed
- Large pending index counts suggest file monitoring backlog
- Consider running full index during off-hours

## Technical Details

### File Monitoring
- Uses Node.js `fs.watch()` for real-time file change detection
- Monitors `~/.claude/projects/` recursively for `.jsonl` files
- Debounced processing (1 second delay) to handle rapid file changes
- Automatically discovers new project directories

### Database Indexing
- SQLite database with FTS5 full-text search extension
- Automatic triggers maintain FTS5 index when messages are added/updated
- Porter stemming algorithm for better search matching
- BM25 relevance scoring for search results

### Search Capabilities
- Full-text search across all conversation content
- Relevance scoring and snippet generation
- Boolean operators (AND, OR) support
- Phrase matching with quotes
- Hybrid fallback to JSONL parsing for recent conversations