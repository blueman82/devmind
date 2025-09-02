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
class AIMemoryDataManager: ObservableObject {
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
        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
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
                    
                    continuation.resume(returning: conversations)
                } else {
                    let error = String(cString: sqlite3_errmsg(self.db))
                    continuation.resume(throwing: AIMemoryError.databaseError(error))
                }
                
                sqlite3_finalize(stmt)
            }
        }
    }
    
    /// Get conversation context from local database
    /// Replaces: mcpClient.getConversationContext()
    func getConversationContext(sessionId: String, page: Int = 1, pageSize: Int = 50) async throws -> ConversationContext {
        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
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
                                
                                let message = ConversationMessage(
                                    role: role,
                                    content: content,
                                    timestamp: timestamp
                                )
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
                            
                            continuation.resume(returning: context)
                        } else {
                            let error = String(cString: sqlite3_errmsg(self.db))
                            continuation.resume(throwing: AIMemoryError.databaseError(error))
                        }
                    } else {
                        continuation.resume(throwing: AIMemoryError.conversationNotFound)
                    }
                } else {
                    let error = String(cString: sqlite3_errmsg(self.db))
                    continuation.resume(throwing: AIMemoryError.databaseError(error))
                }
                
                sqlite3_finalize(stmt)
            }
        }
    }
    
    /// Search conversations in local database
    /// Replaces: mcpClient.searchConversations()
    func searchConversations(query: String, limit: Int = 10) async throws -> [ConversationSearchResult] {
        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
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
                    
                    continuation.resume(returning: results)
                } else {
                    let error = String(cString: sqlite3_errmsg(self.db))
                    continuation.resume(throwing: AIMemoryError.databaseError(error))
                }
                
                sqlite3_finalize(stmt)
            }
        }
    }
    
    // MARK: - Data Indexing (FSEvents Integration)
    
    /// Index a new conversation from JSONL file
    /// This will be called by FSEvents monitoring
    func indexConversation(jsonlPath: String, projectPath: String) async throws {
        // TODO: Implement JSONL parsing and Core Data insertion
        // This replaces the MCP server's indexing functionality
        print("📝 Indexing conversation: \(jsonlPath)")
    }
    
    // MARK: - Helper Methods
    
    private func parseTimeframe(_ timeframe: String) -> Date? {
        let calendar = Calendar.current
        let now = Date()
        
        switch timeframe.lowercased() {
        case "today":
            return calendar.startOfDay(for: now)
        case "yesterday":
            return calendar.date(byAdding: .day, value: -1, to: calendar.startOfDay(for: now))
        case "last week", "week":
            return calendar.date(byAdding: .day, value: -7, to: now)
        case "last month", "month":
            return calendar.date(byAdding: .month, value: -1, to: now)
        default:
            return nil
        }
    }
    
    // MARK: - Save Context
    
    func save() throws {
        if context.hasChanges {
            try context.save()
        }
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

// MARK: - Core Data Extensions

extension Conversation {
    var topicsArray: [String] {
        guard let topicsString = topics else { return [] }
        return topicsString.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }
    }
}

extension Message {
    var toolCallsArray: [String] {
        guard let toolCallsString = toolCalls else { return [] }
        return toolCallsString.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }
    }
}