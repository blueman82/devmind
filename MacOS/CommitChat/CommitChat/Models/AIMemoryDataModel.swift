//
//  AIMemoryDataModel.swift
//  CommitChat
//
//  Created on 2025-09-02.
//

import Foundation
import SQLite3
import Combine

/// Local SQLite database manager for conversation and git history storage
/// 
/// Implements the PRD's SQLite schema for local-first architecture.
/// Replaces MCPClient network calls with instant local database operations.
///
/// ## Architecture Change
/// - OLD: Mac App → JSON-RPC → MCP Server → SQLite
/// - NEW: Mac App → Local SQLite + MCP Server queries Mac App
class AIMemoryDataManager: ObservableObject, @unchecked Sendable {
    static let shared = AIMemoryDataManager()
    
    @Published var isInitialized: Bool = false
    @Published var lastError: String?
    
    // MARK: - SQLite Database
    
    private var db: OpaquePointer?
    private let databaseURL: URL
    
    // MARK: - Initialization
    
    private init() {
        // Store database in Application Support directory
        let appSupportURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let appDirectory = appSupportURL.appendingPathComponent("CommitChat")
        
        // Create directory if needed
        try? FileManager.default.createDirectory(at: appDirectory, withIntermediateDirectories: true)
        
        databaseURL = appDirectory.appendingPathComponent("conversations.db")
        
        initializeDatabase()
    }
    
    private func initializeDatabase() {
        // Open SQLite database
        if sqlite3_open(databaseURL.path, &db) == SQLITE_OK {
            createTables()
            isInitialized = true
            print("✅ AIMemoryDataManager initialized with local SQLite at: \(databaseURL.path)")
        } else {
            let error = String(cString: sqlite3_errmsg(db))
            lastError = "Failed to open database: \(error)"
            print("❌ Database error: \(error)")
        }
    }
    
    private func createTables() {
        let createConversationsTable = """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                session_id TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                project TEXT NOT NULL,
                last_updated DATETIME NOT NULL,
                message_count INTEGER DEFAULT 0,
                topics TEXT,
                summary TEXT,
                has_code BOOLEAN DEFAULT FALSE,
                has_errors BOOLEAN DEFAULT FALSE
            );
        """
        
        let createMessagesTable = """
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT REFERENCES conversations(id),
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp DATETIME NOT NULL,
                tool_calls TEXT
            );
        """
        
        let createIndexes = """
            CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
            CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project);
            CREATE INDEX IF NOT EXISTS idx_conversations_last_updated ON conversations(last_updated);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
        """
        
        executeSQL(createConversationsTable)
        executeSQL(createMessagesTable) 
        executeSQL(createIndexes)
    }
    
    private func executeSQL(_ sql: String) {
        if sqlite3_exec(db, sql, nil, nil, nil) != SQLITE_OK {
            let error = String(cString: sqlite3_errmsg(db))
            print("❌ SQL error: \(error)")
        }
    }
    
    // MARK: - Conversation Operations (replacing MCPClient calls)
    
    /// List recent conversations from local database
    /// Replaces: mcpClient.listRecentConversations()
    func listRecentConversations(limit: Int = 20, timeframe: String = "today") async throws -> [ConversationItem] {
        return try await Task.detached { [weak self] in
            guard let self = self else {
                throw AIMemoryError.databaseError("Database manager deallocated")
            }
                var stmt: OpaquePointer?
                
                let timeframeFilter = self.buildTimeframeFilter(timeframe)
                let sql = """
                    SELECT id, session_id, title, project, last_updated, message_count, topics, summary, has_code, has_errors
                    FROM conversations
                    WHERE last_updated >= datetime('\(timeframeFilter)')
                    ORDER BY last_updated DESC
                    LIMIT \(limit)
                """
                
                if sqlite3_prepare_v2(self.db, sql, -1, &stmt, nil) == SQLITE_OK {
                    var conversations: [ConversationItem] = []
                    
                    while sqlite3_step(stmt) == SQLITE_ROW {
                        let sessionId = String(cString: sqlite3_column_text(stmt, 1))
                        let title = String(cString: sqlite3_column_text(stmt, 2))
                        let project = String(cString: sqlite3_column_text(stmt, 3))
                        let lastUpdatedString = String(cString: sqlite3_column_text(stmt, 4))
                        let messageCount = sqlite3_column_int(stmt, 5)
                        let hasCode = sqlite3_column_int(stmt, 8) != 0
                        let hasErrors = sqlite3_column_int(stmt, 9) != 0
                        
                        let formatter = ISO8601DateFormatter()
                        let lastUpdated = formatter.date(from: lastUpdatedString) ?? Date()
                        
                        let item = ConversationItem(
                            sessionId: sessionId,
                            title: title,
                            project: project,
                            date: lastUpdated,
                            messageCount: Int(messageCount),
                            hasCode: hasCode,
                            hasErrors: hasErrors
                        )
                        conversations.append(item)
                    }
                    
                    sqlite3_finalize(stmt)
                    return conversations
                } else {
                    let error = String(cString: sqlite3_errmsg(self.db))
                    sqlite3_finalize(stmt)
                    throw AIMemoryError.databaseError(error)
                }
            }.value
        }
    
    /// Get conversation context from local database
    /// Replaces: mcpClient.getConversationContext()
    func getConversationContext(sessionId: String, page: Int = 1, pageSize: Int = 50) async throws -> ConversationContext {
        return try await Task.detached { [weak self] in
            guard let self = self else {
                throw AIMemoryError.databaseError("Database manager deallocated")
            }
                var stmt: OpaquePointer?
                
                // First get conversation info
                let conversationSQL = """
                    SELECT message_count FROM conversations WHERE session_id = ?
                """
                
                if sqlite3_prepare_v2(self.db, conversationSQL, -1, &stmt, nil) == SQLITE_OK {
                    sqlite3_bind_text(stmt, 1, sessionId, -1, nil)
                    
                    if sqlite3_step(stmt) == SQLITE_ROW {
                        let totalMessages = sqlite3_column_int(stmt, 0)
                        sqlite3_finalize(stmt)
                        
                        // Now get messages with pagination
                        let offset = (page - 1) * pageSize
                        let messagesSQL = """
                            SELECT role, content, timestamp, tool_calls
                            FROM messages m
                            JOIN conversations c ON m.conversation_id = c.id
                            WHERE c.session_id = ?
                            ORDER BY m.timestamp ASC
                            LIMIT \(pageSize) OFFSET \(offset)
                        """
                        
                        if sqlite3_prepare_v2(self.db, messagesSQL, -1, &stmt, nil) == SQLITE_OK {
                            sqlite3_bind_text(stmt, 1, sessionId, -1, nil)
                            
                            var messages: [ConversationMessage] = []
                            let formatter = ISO8601DateFormatter()
                            
                            while sqlite3_step(stmt) == SQLITE_ROW {
                                let role = String(cString: sqlite3_column_text(stmt, 0))
                                let content = String(cString: sqlite3_column_text(stmt, 1))
                                let timestampString = String(cString: sqlite3_column_text(stmt, 2))
                                let timestamp = formatter.date(from: timestampString) ?? Date()
                                
                                let messageDict: [String: Any] = [
                                    "role": role,
                                    "content": content,
                                    "timestamp": ISO8601DateFormatter().string(from: timestamp)
                                ]
                                let message = try! ConversationMessage(from: messageDict)
                                messages.append(message)
                            }
                            
                            let totalPages = Int(ceil(Double(totalMessages) / Double(pageSize)))
                            let context = ConversationContext(
                                sessionId: sessionId,
                                messages: messages,
                                totalMessages: Int(totalMessages),
                                currentPage: page,
                                totalPages: totalPages
                            )
                            
                            sqlite3_finalize(stmt)
                            return context
                        } else {
                            let error = String(cString: sqlite3_errmsg(self.db))
                            sqlite3_finalize(stmt)
                            throw AIMemoryError.databaseError(error)
                        }
                    } else {
                        sqlite3_finalize(stmt)
                        throw AIMemoryError.conversationNotFound
                    }
                } else {
                    let error = String(cString: sqlite3_errmsg(self.db))
                    sqlite3_finalize(stmt)
                    throw AIMemoryError.databaseError(error)
                }
            }.value
        }
    
    /// Search conversations in local database
    /// Replaces: mcpClient.searchConversations()
    func searchConversations(query: String, limit: Int = 10) async throws -> [ConversationSearchResult] {
        return try await Task.detached { [weak self] in
            guard let self = self else {
                throw AIMemoryError.databaseError("Database manager deallocated")
            }
                var stmt: OpaquePointer?
                
                let sql = """
                    SELECT session_id, title, project, last_updated, summary
                    FROM conversations
                    WHERE title LIKE '%\(query)%' OR summary LIKE '%\(query)%' OR topics LIKE '%\(query)%'
                    ORDER BY last_updated DESC
                    LIMIT \(limit)
                """
                
                if sqlite3_prepare_v2(self.db, sql, -1, &stmt, nil) == SQLITE_OK {
                    var results: [ConversationSearchResult] = []
                    let formatter = ISO8601DateFormatter()
                    
                    while sqlite3_step(stmt) == SQLITE_ROW {
                        let sessionId = String(cString: sqlite3_column_text(stmt, 0))
                        let title = String(cString: sqlite3_column_text(stmt, 1))
                        let project = String(cString: sqlite3_column_text(stmt, 2))
                        let lastUpdatedString = String(cString: sqlite3_column_text(stmt, 3))
                        let summary = String(cString: sqlite3_column_text(stmt, 4))
                        
                        let lastUpdated = formatter.date(from: lastUpdatedString) ?? Date()
                        
                        let result = ConversationSearchResult(
                            sessionId: sessionId,
                            title: title,
                            project: project,
                            date: lastUpdated,
                            messageCount: 0, // Would need separate query for exact count
                            snippet: summary,
                            hasErrors: false // Placeholder
                        )
                        results.append(result)
                    }
                    
                    sqlite3_finalize(stmt)
                    return results
                } else {
                    let error = String(cString: sqlite3_errmsg(self.db))
                    sqlite3_finalize(stmt)
                    throw AIMemoryError.databaseError(error)
                }
            }.value
        }
    
    // MARK: - Data Indexing (FSEvents Integration)
    
    /// Index a new conversation from JSONL file
    /// This will be called by FSEvents monitoring
    func indexConversation(jsonlPath: String, projectPath: String) async throws {
        // TODO: Implement JSONL parsing and SQLite insertion
        // This replaces the MCP server's indexing functionality
        print("📝 Indexing conversation: \(jsonlPath)")
    }
    
    // MARK: - Indexing Methods
    
    func indexConversation(_ conversation: IndexableConversation) async throws {
        try await Task.detached { [weak self] in
            guard let self = self else {
                throw AIMemoryError.databaseError("Database manager deallocated")
            }
                // Begin transaction
                var beginStmt: OpaquePointer?
                if sqlite3_prepare_v2(self.db, "BEGIN TRANSACTION", -1, &beginStmt, nil) == SQLITE_OK {
                    sqlite3_step(beginStmt)
                    sqlite3_finalize(beginStmt)
                }
                
                do {
                    // Insert or update conversation
                    let conversationSql = """
                        INSERT OR REPLACE INTO conversations (
                            session_id, project_path, title, created_at, updated_at,
                            message_count, topics, has_code, has_errors
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """
                    
                    var conversationStmt: OpaquePointer?
                    guard sqlite3_prepare_v2(self.db, conversationSql, -1, &conversationStmt, nil) == SQLITE_OK else {
                        throw AIMemoryError.databaseError("Failed to prepare conversation insert")
                    }
                    
                    defer { sqlite3_finalize(conversationStmt) }
                    
                    // Bind parameters
                    sqlite3_bind_text(conversationStmt, 1, conversation.sessionId, -1, nil)
                    sqlite3_bind_text(conversationStmt, 2, conversation.projectPath, -1, nil)
                    sqlite3_bind_text(conversationStmt, 3, conversation.title, -1, nil)
                    sqlite3_bind_double(conversationStmt, 4, conversation.createdAt.timeIntervalSince1970)
                    sqlite3_bind_double(conversationStmt, 5, conversation.updatedAt.timeIntervalSince1970)
                    sqlite3_bind_int(conversationStmt, 6, Int32(conversation.messages.count))
                    
                    let topicsString = conversation.topics.joined(separator: ", ")
                    sqlite3_bind_text(conversationStmt, 7, topicsString, -1, nil)
                    
                    // Check for code and errors in messages
                    let hasCode = conversation.messages.contains { !$0.toolCalls.isEmpty }
                    let hasErrors = conversation.messages.contains { $0.content.lowercased().contains("error") }
                    sqlite3_bind_int(conversationStmt, 8, hasCode ? 1 : 0)
                    sqlite3_bind_int(conversationStmt, 9, hasErrors ? 1 : 0)
                    
                    guard sqlite3_step(conversationStmt) == SQLITE_DONE else {
                        throw AIMemoryError.databaseError("Failed to insert conversation")
                    }
                    
                    // Delete existing messages for this conversation
                    let deleteSql = "DELETE FROM messages WHERE conversation_id = ?"
                    var deleteStmt: OpaquePointer?
                    if sqlite3_prepare_v2(self.db, deleteSql, -1, &deleteStmt, nil) == SQLITE_OK {
                        sqlite3_bind_text(deleteStmt, 1, conversation.sessionId, -1, nil)
                        sqlite3_step(deleteStmt)
                        sqlite3_finalize(deleteStmt)
                    }
                    
                    // Insert messages
                    let messageSql = """
                        INSERT INTO messages (
                            id, conversation_id, role, content, timestamp, tool_calls
                        ) VALUES (?, ?, ?, ?, ?, ?)
                    """
                    
                    var messageStmt: OpaquePointer?
                    guard sqlite3_prepare_v2(self.db, messageSql, -1, &messageStmt, nil) == SQLITE_OK else {
                        throw AIMemoryError.databaseError("Failed to prepare message insert")
                    }
                    
                    defer { sqlite3_finalize(messageStmt) }
                    
                    for message in conversation.messages {
                        sqlite3_reset(messageStmt)
                        sqlite3_bind_text(messageStmt, 1, message.id, -1, nil)
                        sqlite3_bind_text(messageStmt, 2, conversation.sessionId, -1, nil)
                        sqlite3_bind_text(messageStmt, 3, message.role, -1, nil)
                        sqlite3_bind_text(messageStmt, 4, message.content, -1, nil)
                        sqlite3_bind_double(messageStmt, 5, message.timestamp.timeIntervalSince1970)
                        
                        let toolCallsJson = message.toolCalls.joined(separator: ",")
                        sqlite3_bind_text(messageStmt, 6, toolCallsJson, -1, nil)
                        
                        guard sqlite3_step(messageStmt) == SQLITE_DONE else {
                            throw AIMemoryError.databaseError("Failed to insert message")
                        }
                    }
                    
                    // Delete existing file references
                    let deleteFilesSql = "DELETE FROM file_references WHERE conversation_id = ?"
                    var deleteFilesStmt: OpaquePointer?
                    if sqlite3_prepare_v2(self.db, deleteFilesSql, -1, &deleteFilesStmt, nil) == SQLITE_OK {
                        sqlite3_bind_text(deleteFilesStmt, 1, conversation.sessionId, -1, nil)
                        sqlite3_step(deleteFilesStmt)
                        sqlite3_finalize(deleteFilesStmt)
                    }
                    
                    // Insert file references
                    if !conversation.fileReferences.isEmpty {
                        let fileSql = """
                            INSERT INTO file_references (conversation_id, file_path)
                            VALUES (?, ?)
                        """
                        
                        var fileStmt: OpaquePointer?
                        if sqlite3_prepare_v2(self.db, fileSql, -1, &fileStmt, nil) == SQLITE_OK {
                            defer { sqlite3_finalize(fileStmt) }
                            
                            for filePath in conversation.fileReferences {
                                sqlite3_reset(fileStmt)
                                sqlite3_bind_text(fileStmt, 1, conversation.sessionId, -1, nil)
                                sqlite3_bind_text(fileStmt, 2, filePath, -1, nil)
                                sqlite3_step(fileStmt)
                            }
                        }
                    }
                    
                    // Commit transaction
                    var commitStmt: OpaquePointer?
                    if sqlite3_prepare_v2(self.db, "COMMIT", -1, &commitStmt, nil) == SQLITE_OK {
                        sqlite3_step(commitStmt)
                        sqlite3_finalize(commitStmt)
                    }
                    
                    // Transaction completed successfully
                    
                } catch {
                    // Rollback on error
                    var rollbackStmt: OpaquePointer?
                    if sqlite3_prepare_v2(self.db, "ROLLBACK", -1, &rollbackStmt, nil) == SQLITE_OK {
                        sqlite3_step(rollbackStmt)
                        sqlite3_finalize(rollbackStmt)
                    }
                    
                    throw error
                }
            }.value
        }
    
    // MARK: - Helper Methods
    
    private func buildTimeframeFilter(_ timeframe: String) -> String {
        let calendar = Calendar.current
        let now = Date()
        let formatter = ISO8601DateFormatter()
        
        switch timeframe.lowercased() {
        case "today":
            let startOfDay = calendar.startOfDay(for: now)
            return formatter.string(from: startOfDay)
        case "yesterday":
            if let yesterday = calendar.date(byAdding: .day, value: -1, to: calendar.startOfDay(for: now)) {
                return formatter.string(from: yesterday)
            }
        case "last week", "week":
            if let weekAgo = calendar.date(byAdding: .day, value: -7, to: now) {
                return formatter.string(from: weekAgo)
            }
        case "last month", "month":
            if let monthAgo = calendar.date(byAdding: .month, value: -1, to: now) {
                return formatter.string(from: monthAgo)
            }
        default:
            break
        }
        
        // Default to beginning of time
        return "1970-01-01T00:00:00Z"
    }
    
    // MARK: - Database Management
    
    func closeDatabase() {
        if let db = db {
            sqlite3_close(db)
            self.db = nil
        }
    }
    
    deinit {
        closeDatabase()
    }
}

// MARK: - Supporting Types

enum AIMemoryError: Error, LocalizedError {
    case conversationNotFound
    case invalidData
    case databaseError(String)
    
    var errorDescription: String? {
        switch self {
        case .conversationNotFound:
            return "Conversation not found in local database"
        case .invalidData:
            return "Invalid data format"
        case .databaseError(let message):
            return "Database error: \(message)"
        }
    }
}

// MARK: - Supporting Data Types
// Note: Using existing types from ConversationIndexer.swift and MCPClient.swift
// - IndexableConversation, IndexableMessage: defined in ConversationIndexer.swift
// - ConversationSearchResult, ConversationContext, ConversationMessage: defined in MCPClient.swift