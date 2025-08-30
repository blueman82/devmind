# AI Memory App - Product Requirements Document

## Overview

A macOS application that indexes Claude Code conversations and git history, providing AI assistants with perfect memory of your entire development journey through an MCP (Model Context Protocol) server.

## Problem Statement

### Current Pain Points
- **Context Loss**: Claude Code sessions don't remember previous conversations across projects
- **Session Management**: Hard to identify and resume specific development sessions
- **Git Disaster Recovery**: Complex manual process to restore working states
- **Cross-Project Knowledge**: Can't leverage solutions from previous projects
- **Token Waste**: AI repeatedly re-reads codebases and loses context

### Target Users
- Developers using Claude Code, Cursor, or other AI coding assistants
- Teams collaborating on long-term projects
- Solo developers working across multiple projects
- Anyone frustrated with losing development context

## Solution

### Core Value Propositions
1. **MCP AI Memory** — Your AI remembers every code change and conversation
2. **Massive Token Savings** — Claude knows your history without re-reading
3. **Instant Disaster Recovery** — One-click restore from any moment
4. **Works With All AI Tools** — Claude, Cursor, Copilot get perfect memory
5. **100% Local & Secure** — Your code history never leaves your machine

## Technical Architecture

### macOS Application (Swift + SwiftUI)

#### Core Components
```swift
// Main app structure
class AIMemoryApp: App {
    @StateObject private var conversationIndexer = ConversationIndexer()
    @StateObject private var gitManager = GitRepositoryManager()
    @StateObject private var mcpServer = MCPServerManager()
}

// File system monitoring
class ConversationIndexer: ObservableObject {
    private let fsEventStream: FSEventStreamRef
    private let database: SQLiteDatabase
    
    func startMonitoring()
    func indexConversation(_ jsonlFile: URL)
    func buildSearchIndex()
}

// Git repository management
class GitRepositoryManager: ObservableObject {
    func discoverRepositories()
    func trackRepositoryChanges()
    func createRestorePoint()
    func restoreToCommit()
}

// MCP server coordination
class MCPServerManager: ObservableObject {
    func startMCPServer()
    func handleMCPRequests()
    func provideDatabaseAccess()
}
```

#### Data Storage (SQLite)
```sql
-- Conversations tracking
CREATE TABLE conversations (
    id INTEGER PRIMARY KEY,
    project_hash TEXT NOT NULL,
    session_id TEXT NOT NULL,
    project_path TEXT,
    start_time DATETIME,
    last_updated DATETIME,
    message_count INTEGER,
    topics TEXT, -- JSON array of extracted topics
    keywords TEXT, -- JSON array of keywords
    participants TEXT, -- JSON array (user, assistant, tools)
    file_references TEXT, -- JSON array of referenced files
    git_refs TEXT -- JSON array of related git commits
);

-- Individual messages
CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER REFERENCES conversations(id),
    message_index INTEGER,
    timestamp DATETIME,
    role TEXT, -- user, assistant, tool_use, tool_result
    content_type TEXT, -- text, tool_call, image, etc
    content_summary TEXT,
    tool_calls TEXT, -- JSON array of tool calls
    file_references TEXT, -- JSON array of files mentioned
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Git repositories
CREATE TABLE git_repositories (
    id INTEGER PRIMARY KEY,
    project_path TEXT UNIQUE,
    repository_path TEXT, -- path to .git directory
    remote_url TEXT,
    current_branch TEXT,
    last_scanned DATETIME
);

-- Git commits
CREATE TABLE git_commits (
    id INTEGER PRIMARY KEY,
    repository_id INTEGER REFERENCES git_repositories(id),
    commit_hash TEXT,
    timestamp DATETIME,
    author_name TEXT,
    author_email TEXT,
    message TEXT,
    files_changed TEXT, -- JSON array of changed files
    insertions INTEGER,
    deletions INTEGER,
    is_merge BOOLEAN DEFAULT FALSE,
    parent_hashes TEXT, -- JSON array of parent commit hashes
    FOREIGN KEY (repository_id) REFERENCES git_repositories(id)
);

-- Restore points (special commits/states marked as "good")
CREATE TABLE restore_points (
    id INTEGER PRIMARY KEY,
    repository_id INTEGER REFERENCES git_repositories(id),
    commit_hash TEXT,
    created_at DATETIME,
    label TEXT, -- user-defined label like "login working"
    description TEXT,
    auto_generated BOOLEAN DEFAULT FALSE, -- true for automatic "tests passing" points
    test_status TEXT, -- passing, failing, unknown
    FOREIGN KEY (repository_id) REFERENCES git_repositories(id)
);

-- Conversation-Git correlations
CREATE TABLE conversation_git_links (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER REFERENCES conversations(id),
    commit_id INTEGER REFERENCES git_commits(id),
    link_type TEXT, -- during, before, after, related
    confidence REAL, -- 0.0-1.0 confidence score
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (commit_id) REFERENCES git_commits(id)
);

-- Search index for full-text search
CREATE VIRTUAL TABLE conversation_search USING fts5(
    conversation_id,
    content,
    topics,
    file_paths,
    content='messages',
    content_rowid='id'
);
```

#### User Interface
- **Menu Bar App** - Unobtrusive, always accessible
- **Main Window** - Conversation browser and search
- **Settings Panel** - Configuration and preferences
- **Restore Interface** - Git restore point management

### MCP Server (Node.js/TypeScript)

#### Core MCP Tools

**Conversation Management:**
```typescript
// Find conversations by criteria
interface FindConversationsArgs {
    timeframe?: string; // "2 days ago", "last week"
    project?: string; // project name or path
    keywords?: string[]; // search keywords
    since?: string; // ISO date string
    limit?: number; // max results
}

// Get full conversation context
interface GetConversationContextArgs {
    conversation_id: string;
    include_git_history?: boolean;
    include_file_context?: boolean;
    summary_mode?: 'full' | 'condensed' | 'key_points';
}

// Search across all conversations
interface SearchConversationsArgs {
    query: string; // natural language or keyword search
    projects?: string[]; // limit to specific projects
    timeframe?: string;
    content_types?: ('text' | 'tool_calls' | 'code' | 'errors')[];
    limit?: number;
    search_mode?: 'fuzzy' | 'exact' | 'mixed'; // search matching strategy
    fuzzy_threshold?: number; // 0.0-1.0, lower = more tolerant (default: 0.6)
    logic?: 'OR' | 'AND'; // term combination logic (default: 'OR')
}

// Resume previous conversation
interface ResumeConversationArgs {
    conversation_id: string;
    context_mode?: 'summary' | 'last_n_messages' | 'full';
    include_recent_changes?: boolean;
}
```

**Git History & Restore:**
```typescript
// List available restore points
interface ListRestorePointsArgs {
    project: string; // project path or name
    timeframe?: string; // "last week", "since yesterday"
    type?: 'working_states' | 'all_commits' | 'tagged_points';
    include_auto_generated?: boolean;
}

// Preview what restore would change
interface PreviewRestoreArgs {
    project: string;
    commit_hash: string;
    show_diff?: boolean;
    affected_files_only?: boolean;
}

// Perform project restore
interface RestoreProjectStateArgs {
    project: string;
    commit_hash: string;
    backup_current?: boolean; // create backup branch first
    restore_type?: 'soft' | 'hard' | 'mixed';
    confirmation_required?: boolean;
}

// Smart restore suggestions
interface SuggestRestorePointsArgs {
    project: string;
    problem_description?: string; // "authentication is broken"
    when?: string; // "last working state", "before refactor"
    max_suggestions?: number;
}

// Create manual restore point
interface CreateRestorePointArgs {
    project: string;
    label: string; // user-defined label
    description?: string;
    include_working_changes?: boolean;
}
```

**Cross-Project Intelligence:**
```typescript
// Find similar solutions across projects
interface FindSimilarSolutionsArgs {
    problem_description: string;
    exclude_current_project?: boolean;
    timeframe?: string;
    confidence_threshold?: number; // 0.0-1.0
}

// Get project relationship insights
interface GetProjectInsightsArgs {
    project: string;
    insight_type?: 'patterns' | 'dependencies' | 'team_activity' | 'health';
    timeframe?: string;
}
```

#### MCP Tool Implementations
```typescript
class AIMemoryMCPServer extends Server {
    private database: Database;
    private gitManager: GitManager;
    
    constructor() {
        super({
            name: 'ai-memory-mcp',
            version: '1.0.0'
        }, {
            capabilities: { tools: {} }
        });
        
        this.setupTools();
    }
    
    private setupTools() {
        // Conversation tools
        this.addTool('find_conversations', this.handleFindConversations);
        this.addTool('get_conversation_context', this.handleGetConversationContext);
        this.addTool('search_conversations', this.handleSearchConversations);
        this.addTool('resume_conversation', this.handleResumeConversation);
        
        // Git restore tools
        this.addTool('list_restore_points', this.handleListRestorePoints);
        this.addTool('preview_restore', this.handlePreviewRestore);
        this.addTool('restore_project_state', this.handleRestoreProjectState);
        this.addTool('suggest_restore_points', this.handleSuggestRestorePoints);
        this.addTool('create_restore_point', this.handleCreateRestorePoint);
        
        // Cross-project tools
        this.addTool('find_similar_solutions', this.handleFindSimilarSolutions);
        this.addTool('get_project_insights', this.handleGetProjectInsights);
    }
}
```

## Key Features

### 1. Conversation Indexing & Memory
- **Real-time monitoring** of `~/.claude/projects/` directory using fs.watch()
- **Immediate indexing** - conversations indexed within seconds of creation/modification
- **SQLite FTS5 database** - professional full-text search with stemming and ranking
- **Hybrid search strategy** - SQLite FTS5 for indexed data, JSONL fallback for recent conversations
- **JSONL parsing** with message extraction and categorization
- **Topic extraction** from conversation content
- **File reference tracking** from tool calls
- **Keyword indexing** for fast search
- **Full-text search** across all conversations
- **Fuzzy search tolerance** for typos and variations (configurable threshold)
- **OR logic search** - finds conversations with ANY matching terms, not ALL
- **Flexible query parsing** - supports natural language and mixed keyword/fuzzy queries

### 2. Git Integration & Restore
- **Repository discovery** from conversation project paths
- **Commit history parsing** with file change tracking
- **Automatic restore point creation** (e.g., when tests pass)
- **Manual restore point tagging** by users
- **Safe restore operations** with backup creation
- **Diff preview** before restore operations
- **Smart restore suggestions** based on problem descriptions

### 3. Cross-Project Intelligence
- **Solution pattern recognition** across different projects
- **Code pattern matching** for similar implementations
- **Team collaboration insights** (if applicable)
- **Project health metrics** based on conversation patterns

### 4. MCP Integration
- **Seamless AI assistant integration** with Claude Code, Cursor, etc.
- **Natural language querying** of conversation history
- **Context-aware responses** based on conversation history
- **Token-efficient** context provision to AI assistants

## User Experience

### Installation & Setup
1. **Download DMG** - Simple installer package
2. **Launch app** - Automatically starts monitoring Claude projects
3. **Grant permissions** - File system access for monitoring
4. **Install MCP server** - One-click MCP server setup for AI tools

### Daily Usage
1. **Transparent operation** - App runs in background, indexing automatically
2. **AI interactions** - Claude/Cursor automatically gain conversation memory
3. **Search & resume** - Find and resume previous development sessions
4. **Disaster recovery** - One-click restore to working states
5. **Cross-project learning** - AI suggests solutions from other projects

### Menu Bar Interface
- **Status indicator** - Shows indexing status and recent activity
- **Quick search** - Instant search across all conversations
- **Recent conversations** - Quick access to recent development sessions
- **Restore points** - List of tagged working states
- **Settings** - App configuration and preferences

## Technical Requirements

### macOS Application
- **Deployment target**: macOS 12.0+ (covers 95%+ of users)
- **Architecture**: Universal binary (Intel + Apple Silicon)
- **File system monitoring**: FSEvents API for real-time directory watching
- **Database**: SQLite with FTS5 extension for full-text search
- **Git integration**: LibGit2 via Swift bindings or command-line git
- **Background processing**: Separate queues for indexing and git operations
- **Memory management**: Efficient parsing of large JSONL files

### MCP Server
- **Runtime**: Node.js 18+ for compatibility
- **Protocol**: MCP (Model Context Protocol) compliance
- **Database**: SQLite with better-sqlite3 npm package for FTS5 support
- **Real-time indexing**: fs.watch() for immediate conversation indexing
- **Hybrid search**: SQLite FTS5 primary + JSONL fallback for recent changes
- **Database location**: ~/.claude/ai-memory/conversations.db
- **Git operations**: Simple-git or NodeGit library
- **Error handling**: Robust error handling for file system operations and corrupted JSONL files
- **Performance**: Efficient querying with proper indexing and real-time updates

### Security & Privacy
- **Local-only operation** - No network connections or data uploads
- **File system permissions** - Minimal required access
- **Data encryption** - Optional SQLite database encryption
- **Secure git operations** - Safe git operations with user confirmation
- **Privacy compliance** - No telemetry or usage tracking

## Business Model

### Pricing Strategy
- **Free Tier**: Single project, last 30 conversations, basic restore
- **Pro Tier** ($19/month): Unlimited projects, full history, advanced search, smart suggestions
- **Team Tier** ($39/month): Shared conversation indices, team restore points, collaboration features

### Go-to-Market
1. **Developer communities** - Reddit, Discord, Twitter
2. **Direct outreach** - Claude Code and Cursor user communities
3. **Content marketing** - Blog posts about AI-assisted development
4. **Influencer partnerships** - AI coding tool reviewers and educators

### Revenue Projections (18 months)
- **Month 3**: 100 users, $500 MRR
- **Month 6**: 500 users, $3,000 MRR  
- **Month 12**: 2,000 users, $15,000 MRR
- **Month 18**: 5,000+ users, $40,000+ MRR

## Development Roadmap

### Phase 1: MVP (6-8 weeks)
- [ ] Basic macOS app with conversation monitoring
- [ ] SQLite database schema and indexing
- [ ] Simple MCP server with conversation search
- [ ] Basic git repository discovery and commit tracking
- [ ] Core restore functionality
- [ ] Menu bar interface

### Phase 2: Beta (2-3 weeks)
- [ ] Advanced search and filtering
- [ ] Smart restore point suggestions
- [ ] Cross-project solution finding
- [ ] UI polish and error handling
- [ ] User testing and feedback integration

### Phase 3: Launch (1-2 weeks)
- [ ] Distribution setup (DMG, code signing)
- [ ] Documentation and onboarding
- [ ] Initial marketing campaign
- [ ] User feedback collection

### Phase 4: Growth (ongoing)
- [ ] Team collaboration features
- [ ] Advanced AI integrations
- [ ] Performance optimizations
- [ ] Additional AI tool support (beyond Claude/Cursor)

## Success Metrics

### Technical Metrics
- **Indexing performance**: < 100ms average conversation parsing time
- **Search response time**: < 200ms for typical queries
- **Memory usage**: < 100MB resident memory
- **Database size efficiency**: < 10MB per 1000 conversations

### User Metrics
- **Daily active users**: Track engagement with conversation search
- **Restore operations**: Number of successful project restores
- **Time saved**: Estimated context rebuilding time saved per user
- **User retention**: Monthly retention rates

### Business Metrics
- **Customer acquisition cost**: Cost per new user
- **Monthly recurring revenue**: Growth rate and churn
- **User feedback**: Net Promoter Score and feature requests
- **Market penetration**: Percentage of Claude Code users using the app

## Risk Analysis

### Technical Risks
- **Claude API changes**: Changes to conversation file format
- **File system permissions**: macOS security model changes
- **Performance scaling**: Large conversation databases
- **Git operation safety**: Risk of data loss during restores

### Business Risks
- **Competition**: Similar products from larger companies
- **Market adoption**: Slower than expected user growth
- **Pricing pressure**: Race to bottom with competitors
- **Platform dependency**: Over-reliance on Claude Code ecosystem

### Mitigation Strategies
- **Robust error handling** and backup systems
- **Diversified AI tool support** beyond just Claude
- **Strong user feedback loops** for rapid iteration
- **Financial runway** for 12+ months of development