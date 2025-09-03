# Phase 2 Implementation Plan: Auto-Commit Functionality

## Executive Summary
Phase 2 introduces auto-commit functionality with shadow branches, creating complete development memory by linking git commits to Claude Code conversations.

## Core Architecture

### The Single-Check Principle
- **Single Logic**: Check ~/.claude/projects for conversation match
- **If Match Found**: Use rich conversation context for commit message
- **If No Match**: Use intelligent diff analysis
- **Covers All Scenarios**: No Claude, Claude inactive, Claude active

## Technical Implementation

### 1. Shadow Branch System

**Pattern**: `shadow/[original-branch-name]`

**Examples**:
- `main` → `shadow/main`
- `feature-auth` → `shadow/feature-auth`

**Benefits**:
- User's branches remain clean (no auto-commit clutter)
- Complete granular history preserved
- Never interferes with user workflow
- Cherry-pick specific saves when needed

### 2. File Monitoring System

**Technology**: FSEvents API (macOS native)

**Triggers**: Every file save in monitored repositories

**Filtering**:
- Always respect .gitignore
- Exclude patterns:
  - `node_modules/**`
  - `dist/**`
  - `*.lock` files
  - `.env` files (even if not in gitignore)
  - Global user-configurable patterns (`*.log`, `*.tmp`, etc.)
- Size limit: 10MB default (configurable)
- Throttling: Minimum 2 seconds between commits
- Depth limits: Maximum 5 levels deep for repository scanning

**Sensitive File Detection**:
- Scan file contents for API keys, passwords, tokens
- Pattern matching for common secrets (AWS keys, JWT tokens, etc.)
- Warning system before auto-committing suspected sensitive files
- Never auto-commit files with detected sensitive content
- User override option with explicit confirmation

### 3. Conversation Detection

**Search Location**: User-configurable via UI (default: `~/.claude/projects/*/conversations/*.jsonl`)
- **Already Implemented**: Project Path field in MCP Server Settings
- **UI Location**: `MCPServerSettingsView.swift` - configurable text field with browse button
- **Flexibility**: Users can point to custom Claude project locations
- **Current Implementation**: claudeProjectsPath is currently hardcoded in `ConversationIndexer.swift`
- **Impact**: Search location for Claude projects is user-configurable
- **Benefit**: More flexible than hardcoded ~/.claude/projects path
- **Implementation Note**: Use `appState.projectPath` instead of hardcoded path in Phase 2

**Match Criteria**:
- File path exact match
- Edit/Write tool_use event within last 10 seconds
- Extract sessionId and conversation context

**Conversation Data Extraction**:
- Parse conversation for problem description
- Extract solution approach discussed
- Identify files mentioned in conversation
- Capture conversation topic/summary
- Reference specific code changes discussed

**Implementation Flow**:
1. FSEvents detects file save
2. Search for recent tool_use event
3. If found → Extract conversation context
4. If not found → Use diff analysis

### 4. Commit Message Generation

#### With Conversation Context:
```
Fix authentication flow - shadow/feature-auth

Implemented OAuth2 as discussed in Claude session. Changed from 
password-based to token-based authentication per security concerns
raised in conversation.

Session: 7744aef1-527a-4a96
Files: src/auth/oauth.js, src/auth/config.js
Changes: +145/-23 lines
```

#### Without Conversation Context:
```
Update authentication module - shadow/feature-auth

Modified OAuth2 implementation with enhanced error handling.
Added retry logic for failed token requests and improved 
validation for refresh tokens.

Files: src/auth/oauth.js, src/auth/config.js  
Changes: +145/-23 lines
```

### 5. Database Architecture

#### Concurrent Access Solution:
- Enable SQLite WAL mode on all connections
- Connection pooling in MCP server
- Read-optimized queries
- Write queue for auto-commit indexing
- Swift app indexing never blocked

#### New Tables:

**shadow_commits**:
- commit_hash
- shadow_branch
- original_branch
- timestamp
- files_changed

**conversation_git_correlations**:
- conversation_session_id
- commit_hash
- repository_path
- correlation_confidence
- created_at

**repository_settings**:
- repository_path
- auto_commit_enabled
- notification_preferences
- excluded_patterns
- commit_throttle_seconds

### 6. Repository Management

#### Auto-Detection:
- **Primary**: Parse ~/.claude/projects for active repos
- **Secondary**: Scan user-defined directories for .git
- **Monitoring**: FSEvents for new repository detection

#### UI Features:
- Repository list with enable/disable toggles
- Per-repo settings (throttle, notifications, exclusions)
- Manual folder selection
- Statistics dashboard (commits/hour, storage used)
- Auto-detection status indicator
- Global exclusion patterns configuration

### 7. Notification System

**Framework**: UNUserNotificationCenter (modern macOS API)

**Frequency Options**:
- Every commit (verbose)
- Batched every 10 commits
- Hourly summary
- Disabled

**User Preferences**:
- Global on/off toggle
- Per-repository settings
- Do not disturb hours

## Implementation Timeline

### Phase 2a: Foundation (Weeks 1-2)
**Week 1**:
- Enable SQLite WAL mode
- Create database schema for new tables
- Implement shadow branch creation logic
- Basic FSEvents file monitoring

**Week 2**:
- ~/.claude/projects parsing for correlation
- Diff-based message generation
- Shadow branch auto-commit logic
- Basic testing with single repository

### Phase 2b: Enrichment (Weeks 3-4)
**Week 3**:
- Repository auto-detection system
- Repository management UI
- Conversation context extraction
- Rich commit message generation

**Week 4**:
- UNUserNotificationCenter integration
- Per-repository settings
- File filtering and exclusions
- Throttling and performance optimization

### Phase 2c: Polish (Weeks 5-6)
**Week 5**:
- Statistics dashboard
- Advanced settings UI
- Documentation and help system
- Optional local LLM integration
- Comprehensive testing

**Week 6**:
- Performance optimization
- Beta testing with real projects
- Documentation
- Ship Phase 2

## Success Metrics

### Technical Goals:
- Zero interference with user git workflow
- < 50ms file save to commit time
- < 100MB storage per 1000 commits
- 100% accuracy in conversation correlation

### User Experience Goals:
- Works immediately with zero config
- Valuable for both Claude and non-Claude users
- Never loses a single file save
- Searchable development history

## Competitive Advantages

### vs ShadowGit:
- **Shadow branches**: Cleaner workflow, no commit clutter
- **Conversation context**: Our unique value proposition
- **Native macOS app**: Better performance and integration
- **Intelligent correlation**: Not just timestamp-based

### Unique Value:
- Complete development memory: discussions AND code evolution
- Bidirectional search: conversation→code and code→conversation
- Semantic correlation across projects and time

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| JSONL reliability | Always have diff-based fallback |
| Performance impact | Throttling and optimization |
| Storage growth | Automatic cleanup options |
| User confusion | Clear UI indicators of current mode |
| False correlations | Only use context when 100% certain |

## Architecture Evolution

This plan represents the evolution through multiple iterations:
1. **v1**: Complex JSONL correlation with timing windows
2. **v2**: Claude installation detection
3. **v3**: Session activity monitoring
4. **v4 Final**: Single check in ~/.claude/projects

The final architecture is elegantly simple while covering all user scenarios.

## Quick Answers to Outstanding Questions

1. **Local LLM**: Optional setting for enhanced diff messages (not required)
2. **Notifications**: User-configurable (default: batched every 10 commits)
3. **Shadow naming**: Confirmed `shadow/[branch]` pattern
4. **File size limits**: 10MB default, configurable per-repo
5. **Commit throttling**: 2 seconds minimum, configurable

## Code Example

```swift
// Notification Implementation Example
import UserNotifications

func sendAutoCommitNotification(for file: String, branch: String) {
    let center = UNUserNotificationCenter.current()
    let content = UNMutableNotificationContent()
    content.title = "Auto-commit saved"
    content.body = "Updated \(file) - shadow/\(branch)"
    content.sound = .default
    
    let request = UNNotificationRequest(
        identifier: UUID().uuidString,
        content: content,
        trigger: nil
    )
    
    center.add(request)
}
```

## Next Steps

1. Begin Phase 2a implementation with SQLite WAL mode
2. Create shadow branch management system
3. Implement basic FSEvents monitoring
4. Test with single repository before expanding

---

*Generated: 2025-09-03*
*Status: Ready for Implementation*