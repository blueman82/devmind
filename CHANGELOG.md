# Changelog

All notable changes to the DevMind AI Memory project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2025-09-01

### Swift macOS App - Phase 2 (65% Complete)

#### Added
- **AppState.swift** (99 lines) - Centralized state management with @StateObject
  - Window visibility states
  - Mock data structures for Phase 2
  - Singleton pattern implementation
  - Commit: 3e51666

- **SearchWindow.swift** (169 lines) - Conversation search interface
  - Live search with filtering
  - Filter chips for quick filtering
  - Conversation results display
  - Token count tracking
  - Commit: f1ed7d1

- **MainBrowserWindow.swift** (323 lines) - Full conversation browser
  - NavigationSplitView with sidebar
  - Project filtering sidebar
  - Conversation cards grid view
  - Detail view for selected conversations
  - Commit: c5c252f

- **RestorePointsWindow.swift** (402 lines) - Git restore interface
  - Restore point list with metadata
  - Preview pane with statistics
  - File changes preview
  - Confirmation dialog
  - Commit: e74bbc9

- **SettingsWindow.swift** (475 lines) - Comprehensive settings panel
  - 6 setting categories (General, MCP Server, Appearance, Search, Notifications, Advanced)
  - MCP server configuration
  - Appearance customization
  - Debug options
  - Commit: (pending)

#### Changed
- Project structure cleaned up (Pre-Phase 2)
  - Removed duplicate 'AI Memory' folder
  - Deleted disconnected Package.swift
  - Cleaned up test boilerplate
  - Code review grade: C+ → B-

#### Statistics
- Total lines added: 1,468
- Files created: 5
- Commits made: 5
- Time elapsed: ~20 minutes

#### Remaining for Phase 2 Completion
- Update ContentView to open windows instead of printing
- Add hover effects to menu items
- Test all window navigation

---

## [Phase 1] - 2025-08-31

### Swift macOS App - Initial Setup (95% Complete)

#### Added
- Xcode 16.4 project setup (CommitChat.xcodeproj)
- Menu bar app with LSUIElement (no dock icon)
- Basic dropdown menu with 4 items
- Quit functionality

#### Pending
- Optional: Add Echo logo as app icon

---

## [Backend v1.0.0] - 2025-08-30

### MCP Server - Production Ready

#### Added
- SQLite FTS5 database with 550+ conversations indexed
- 9 MCP tools fully operational
- Real-time indexing with fs.watch()
- 33/33 tests passing
- Sub-millisecond search response times

#### Features
- **search_conversations** - Full-text search with fuzzy matching
- **get_conversation_context** - Paginated conversation retrieval
- **list_recent_conversations** - Time-based filtering
- **find_similar_solutions** - Pattern matching across projects
- **get_git_context** - Git history integration
- **list_restore_points** - Git restore point management
- **create_restore_point** - Save working states
- **preview_restore** - Preview changes before restore
- **restore_project_state** - Execute git restoration