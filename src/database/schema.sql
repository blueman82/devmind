-- AI Memory App - SQLite Database Schema with FTS5
-- Stores conversation data from Claude Code projects with full-text search capabilities

-- Enable FTS5 extension (should be available in modern SQLite)
-- PRAGMA table_info=fts5;

-- Main conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    project_hash TEXT,
    project_name TEXT,
    project_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    message_count INTEGER DEFAULT 0,
    file_references TEXT, -- JSON array of file paths referenced
    topics TEXT, -- JSON array of extracted topics
    keywords TEXT, -- JSON array of keywords for search
    total_tokens INTEGER DEFAULT 0
);

-- Indexes for conversations table
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_project_path ON conversations(project_path);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);

-- Individual messages within conversations
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    message_index INTEGER NOT NULL,
    uuid TEXT,
    timestamp DATETIME,
    role TEXT NOT NULL, -- 'user', 'assistant', 'tool_use', 'tool_result'
    content_type TEXT, -- 'text', 'tool_call', 'image', etc.
    content TEXT,
    content_summary TEXT, -- Condensed version for quick scanning
    tool_calls TEXT, -- JSON array of tool calls if applicable
    file_references TEXT, -- JSON array of files mentioned in this message
    tokens INTEGER DEFAULT 0,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Indexes for messages table
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_content_type ON messages(content_type);

-- FTS5 virtual table for full-text search across message content
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    message_id UNINDEXED, -- Reference to messages.id
    content,
    topics,
    file_paths,
    project_path UNINDEXED,
    created_at UNINDEXED,
    tokenize='porter ascii'
);

-- Trigger to automatically populate FTS5 table when messages are inserted
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(message_id, content, topics, file_paths, project_path, created_at)
    SELECT 
        NEW.id,
        NEW.content,
        (SELECT topics FROM conversations WHERE id = NEW.conversation_id),
        NEW.file_references,
        (SELECT project_path FROM conversations WHERE id = NEW.conversation_id),
        NEW.timestamp
    FROM conversations WHERE id = NEW.conversation_id;
END;

-- Trigger to update FTS5 table when messages are updated
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
    UPDATE messages_fts SET 
        content = NEW.content,
        file_paths = NEW.file_references,
        topics = (SELECT topics FROM conversations WHERE id = NEW.conversation_id)
    WHERE message_id = NEW.id;
END;

-- Trigger to remove from FTS5 table when messages are deleted
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
    DELETE FROM messages_fts WHERE message_id = OLD.id;
END;

-- Index for conversation search optimization
CREATE TABLE IF NOT EXISTS conversation_search_cache (
    conversation_id INTEGER PRIMARY KEY,
    search_text TEXT, -- Concatenated searchable text from all messages
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Statistics table for performance monitoring
CREATE TABLE IF NOT EXISTS index_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stat_name TEXT NOT NULL UNIQUE,
    stat_value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial stats
INSERT OR IGNORE INTO index_stats (stat_name, stat_value) VALUES 
    ('total_conversations', '0'),
    ('total_messages', '0'),
    ('last_full_index', ''),
    ('last_incremental_index', ''),
    ('schema_version', '1.0.0');

-- View for easy conversation search with metadata
CREATE VIEW IF NOT EXISTS conversation_search AS
SELECT 
    c.id,
    c.session_id,
    c.project_name,
    c.project_path,
    c.created_at,
    c.updated_at,
    c.message_count,
    c.topics,
    c.keywords,
    c.total_tokens,
    csc.search_text
FROM conversations c
LEFT JOIN conversation_search_cache csc ON c.id = csc.conversation_id;

-- View for message search with conversation context
CREATE VIEW IF NOT EXISTS message_search AS
SELECT 
    m.id as message_id,
    m.conversation_id,
    c.session_id,
    c.project_name,
    c.project_path,
    m.timestamp,
    m.role,
    m.content_type,
    m.content,
    m.content_summary,
    m.file_references,
    c.topics,
    c.keywords
FROM messages m
JOIN conversations c ON m.conversation_id = c.id;

-- ============================================================================
-- PHASE 2: AUTO-COMMIT FUNCTIONALITY TABLES
-- ============================================================================

-- Shadow commits table - tracks all auto-commits to shadow branches
CREATE TABLE IF NOT EXISTS shadow_commits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commit_hash TEXT NOT NULL UNIQUE,
    shadow_branch TEXT NOT NULL,
    original_branch TEXT NOT NULL,
    repository_path TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    files_changed TEXT, -- JSON array of file paths
    lines_added INTEGER DEFAULT 0,
    lines_removed INTEGER DEFAULT 0,
    commit_message TEXT,
    conversation_session_id TEXT, -- Links to conversations.session_id if correlated
    correlation_confidence REAL DEFAULT 0.0, -- 1.0 = certain match, 0.0 = no context used
    FOREIGN KEY (conversation_session_id) REFERENCES conversations(session_id) ON DELETE SET NULL
);

-- Indexes for shadow_commits
CREATE INDEX IF NOT EXISTS idx_shadow_commits_hash ON shadow_commits(commit_hash);
CREATE INDEX IF NOT EXISTS idx_shadow_commits_timestamp ON shadow_commits(timestamp);
CREATE INDEX IF NOT EXISTS idx_shadow_commits_shadow_branch ON shadow_commits(shadow_branch);
CREATE INDEX IF NOT EXISTS idx_shadow_commits_repository_path ON shadow_commits(repository_path);
CREATE INDEX IF NOT EXISTS idx_shadow_commits_conversation ON shadow_commits(conversation_session_id);

-- Conversation-Git correlations table - links conversations to git activity
CREATE TABLE IF NOT EXISTS conversation_git_correlations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_session_id TEXT NOT NULL,
    commit_hash TEXT,
    repository_path TEXT NOT NULL,
    correlation_type TEXT, -- 'auto_commit', 'manual_commit', 'restore_point', 'branch_switch'
    correlation_confidence REAL DEFAULT 1.0,
    correlation_metadata TEXT, -- JSON with additional correlation details
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_session_id) REFERENCES conversations(session_id) ON DELETE CASCADE
);

-- Indexes for correlations
CREATE INDEX IF NOT EXISTS idx_correlations_session ON conversation_git_correlations(conversation_session_id);
CREATE INDEX IF NOT EXISTS idx_correlations_commit ON conversation_git_correlations(commit_hash);
CREATE INDEX IF NOT EXISTS idx_correlations_repo ON conversation_git_correlations(repository_path);
CREATE INDEX IF NOT EXISTS idx_correlations_created ON conversation_git_correlations(created_at);

-- Repository settings table - per-repository auto-commit configuration
CREATE TABLE IF NOT EXISTS repository_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repository_path TEXT NOT NULL UNIQUE,
    auto_commit_enabled BOOLEAN DEFAULT 1,
    notification_preference TEXT DEFAULT 'batched', -- 'every', 'batched', 'hourly', 'disabled'
    excluded_patterns TEXT, -- JSON array of glob patterns to exclude
    commit_throttle_seconds INTEGER DEFAULT 2,
    max_file_size_mb INTEGER DEFAULT 10,
    shadow_branch_prefix TEXT DEFAULT 'shadow/',
    last_auto_commit DATETIME,
    total_auto_commits INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for repository settings
CREATE INDEX IF NOT EXISTS idx_repo_settings_path ON repository_settings(repository_path);
CREATE INDEX IF NOT EXISTS idx_repo_settings_enabled ON repository_settings(auto_commit_enabled);

-- Update schema version for Phase 2
UPDATE index_stats SET stat_value = '2.0.0' WHERE stat_name = 'schema_version';

-- Add Phase 2 stats
INSERT OR IGNORE INTO index_stats (stat_name, stat_value) VALUES 
    ('total_shadow_commits', '0'),
    ('total_repositories_monitored', '0'),
    ('total_correlations', '0'),
    ('phase_2_initialized', DATETIME('now'));