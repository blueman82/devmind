# DevMind System Architecture

## Overview

DevMind is a Model Context Protocol (MCP) server that provides AI assistants with persistent memory of development conversations and git history. Built with Node.js and SQLite, it offers enterprise-grade performance, security, and reliability.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Assistants Layer                      │
│  (Claude Code, Cursor, Copilot, Custom AI Tools)            │
└────────────────────┬────────────────────────────────────────┘
                     │ MCP Protocol (stdio)
┌────────────────────▼────────────────────────────────────────┐
│                    MCP Server (Node.js)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  Request Router                       │  │
│  │    (mcp-server.js - Tool registration & dispatch)    │  │
│  └────────┬─────────────────────┬──────────────────────┘  │
│           │                     │                           │
│  ┌────────▼──────────┐ ┌───────▼────────────────────────┐ │
│  │  Tool Handlers     │ │    Git Tool Handlers          │ │
│  │  - Search          │ │  - Git Context                │ │
│  │  - Get Context     │ │  - Restore Points             │ │
│  │  - List Recent     │ │  - Preview/Restore            │ │
│  │  - Find Similar    │ │  - Project State              │ │
│  └────────┬──────────┘ └───────┬────────────────────────┘ │
│           │                     │                           │
└───────────┼─────────────────────┼───────────────────────────┘
            │                     │
┌───────────▼─────────────────────▼───────────────────────────┐
│                    Core Services Layer                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐ │
│  │ Database Manager│ │  Git Manager    │ │Path Validator│ │
│  │ - Connection    │ │ - Repository    │ │- Security    │ │
│  │ - Transactions  │ │ - Commits       │ │- Traversal   │ │
│  │ - Performance   │ │ - Status        │ │  Protection  │ │
│  └────────┬────────┘ └────────┬────────┘ └──────────────┘ │
│           │                    │                            │
│  ┌────────▼──────────────────┐│┌─────────────────────────┐ │
│  │   Secure Git Executor      ││  Error Sanitizer        │ │
│  │ - Command Whitelisting     ││ - Remove Sensitive Data │ │
│  │ - Argument Validation      ││ - Standardize Errors    │ │
│  │ - Timeout Protection       ││                         │ │
│  └────────────────────────────┘└─────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   Data Layer (SQLite)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Database Schema                         │   │
│  │  • conversations (indexed by project, session)      │   │
│  │  • messages (FTS5 full-text search)                │   │
│  │  • git_repositories (project tracking)             │   │
│  │  • git_commits (history tracking)                  │   │
│  │  • restore_points (tagged states)                  │   │
│  │  • git_commit_files (change tracking)              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Performance Features:                                       │
│  • Prepared statement caching                               │
│  • Connection pooling                                       │
│  • SQLite pragmas (64MB cache, 256MB mmap)                 │
│  • FTS5 full-text indexing                                 │
└──────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. MCP Server Layer

**Location**: `src/mcp-server/`

The MCP server is the entry point for all AI assistant interactions. It:
- Registers available tools with the MCP protocol
- Routes requests to appropriate handlers
- Manages stdio communication
- Handles error responses

**Key Files**:
- `mcp-server.js` - Main server implementation
- `handlers/tool-handlers.js` - Conversation search handlers
- `handlers/git-tool-handlers.js` - Git operation coordinator

### 2. Tool Handlers

**Location**: `src/mcp-server/handlers/`

Specialized handlers for different tool categories:

#### Conversation Tools
- **search_conversations**: Full-text search with fuzzy matching
- **get_conversation_context**: Retrieve specific conversation
- **list_recent_conversations**: Time-based filtering
- **find_similar_solutions**: Cross-project solution discovery

#### Git Tools (Modular Architecture)
- **git-context-handlers.js**: Repository discovery and indexing
- **restore-point-handlers.js**: Create and list restore points
- **preview-handlers.js**: Preview restoration changes
- **restore-handlers.js**: Generate restoration commands

### 3. Core Services

**Location**: `src/`

#### Database Manager (`database/database-manager.js`)
- SQLite connection management
- Transaction handling
- Performance optimization
- Schema initialization

#### Git Manager (`git/git-manager.js`)
- Repository discovery
- Commit history retrieval
- Working directory status
- Cache management (30-second TTL)

#### Security Components
- **Path Validator** (`utils/path-validator.js`): Path traversal protection
- **Secure Git Executor** (`utils/secure-git-executor.js`): Command whitelisting
- **Error Sanitizer** (`utils/error-sanitizer.js`): Sensitive data removal

### 4. Database Schema

**Location**: `src/database/`

#### Core Tables
```sql
-- Conversations tracking
conversations (
  id, project_hash, session_id, project_path,
  start_time, last_updated, message_count
)

-- Message storage with FTS5
messages (
  id, conversation_id, timestamp, role,
  content_type, content
)

-- Git repository tracking
git_repositories (
  id, project_path, working_directory,
  git_directory, remote_url, current_branch
)

-- Commit history
git_commits (
  id, repository_id, commit_hash, author_name,
  commit_date, message, parent_commits
)

-- Restore points
restore_points (
  id, repository_id, commit_hash, label,
  description, test_status, auto_generated
)
```

## Data Flow

### 1. Search Request Flow
```
AI Assistant → MCP Server → Tool Handler → Database Manager
    ↓                                              ↓
Response ← Format Result ← Search Results ← SQLite FTS5
```

### 2. Git Operation Flow
```
AI Assistant → MCP Server → Git Tool Handler → Git Manager
    ↓                              ↓                ↓
Response ← Command Generation ← Git Status ← Secure Executor
```

### 3. Indexing Flow
```
File System → Parser → Database Manager → SQLite
     ↓            ↓            ↓            ↓
  Monitor → Extract → Transform → Index (FTS5)
```

## Security Architecture

### Defense in Depth

1. **Input Layer**
   - Parameter validation
   - Type checking
   - Range limits

2. **Path Security**
   - Absolute path resolution
   - Traversal detection
   - Allowed directory validation

3. **Command Security**
   - Whitelist-only git commands
   - Argument sanitization
   - No shell interpretation

4. **Database Security**
   - Parameterized queries only
   - No dynamic SQL generation
   - Transaction isolation

5. **Output Security**
   - Error message sanitization
   - No path exposure
   - No credential leakage

## Performance Architecture

### Optimization Strategies

1. **Database Optimizations**
   - Prepared statement caching (10-20% improvement)
   - Connection pooling
   - SQLite pragmas for performance
   - Batch operations where possible

2. **Parallel Processing**
   - Commit indexing in batches of 5
   - Promise.all() for concurrent operations
   - Async/await throughout

3. **Caching Strategy**
   - 30-second repository cache
   - Prepared statement reuse
   - In-memory operation results

4. **Efficient Queries**
   - Database-first approach
   - Git fallback only when needed
   - Indexed columns for fast lookups

## Deployment Architecture

### Current Implementation
- **Platform**: Node.js (ES6 modules)
- **Database**: SQLite with FTS5
- **Protocol**: MCP over stdio
- **Security**: Process isolation

### Future Architecture
- **macOS App**: Swift + SwiftUI wrapper
- **Background Service**: File system monitoring
- **Real-time Indexing**: FSEvents integration
- **Multi-project**: Correlation engine

## Monitoring & Observability

### Logging
- Structured logging with context
- Error tracking with sanitization
- Performance metrics collection

### Health Checks
- Database connectivity
- Git command availability
- MCP server responsiveness

### Metrics
- Query performance
- Indexing throughput
- Cache hit rates
- Error rates

## Scalability Considerations

### Current Limits
- Single SQLite database
- Local file system only
- Stdio communication

### Scaling Options
- Database sharding by project
- Background indexing workers
- Remote repository support
- WebSocket MCP transport

## Technology Stack

### Core Technologies
- **Runtime**: Node.js 18+
- **Database**: SQLite 3 with FTS5
- **Protocol**: MCP (Model Context Protocol)
- **Testing**: Node.js native test runner

### Key Dependencies
- `better-sqlite3`: SQLite driver
- `@modelcontextprotocol/sdk`: MCP implementation
- `child_process`: Git command execution

### Development Tools
- ESLint for code quality
- Prettier for formatting
- Git hooks for pre-commit checks

---

*Last Updated: 2025-08-31*
*Architecture Version: 2.0*