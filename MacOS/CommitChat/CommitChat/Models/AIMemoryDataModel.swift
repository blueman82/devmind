//
//  AIMemoryDataModel.swift
//  CommitChat
//
//  Created on 2025-09-02.
//

import Foundation
import SQLite3
import Combine

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
    private let databaseQueue = DispatchQueue(label: "com.commitchat.database", qos: .background)
    
    // MARK: - Initialization
    
    private init() {
        print("🔧 AIMemoryDataManager: Starting initialization...")
        
        // Store database in Application Support directory
        let appSupportURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let appDirectory = appSupportURL.appendingPathComponent("CommitChat")
        print("🔧 AIMemoryDataManager: App directory: \(appDirectory.path)")
        
        // Create directory if needed
        do {
            try FileManager.default.createDirectory(at: appDirectory, withIntermediateDirectories: true)
            print("🔧 AIMemoryDataManager: Directory created/verified")
        } catch {
            print("❌ AIMemoryDataManager: Failed to create directory: \(error)")
        }
        
        databaseURL = appDirectory.appendingPathComponent("conversations.db")
        print("🔧 AIMemoryDataManager: Database URL: \(databaseURL.path)")
        
        initializeDatabase()
    }
    
    private func initializeDatabase() {
        // Open SQLite database
        if sqlite3_open(databaseURL.path, &db) == SQLITE_OK {
            // Log SQLite version for debugging
            let versionQuery = "SELECT sqlite_version();"
            var statement: OpaquePointer?
            if sqlite3_prepare_v2(db, versionQuery, -1, &statement, nil) == SQLITE_OK {
                if sqlite3_step(statement) == SQLITE_ROW {
                    let version = String(cString: sqlite3_column_text(statement, 0))
                    print("🔍 SQLite version in use: \(version)")
                }
                sqlite3_finalize(statement)
            }
            
            createTables()
            checkAndRepairDatabase()
            isInitialized = true
            print("✅ AIMemoryDataManager initialized with local SQLite at: \(databaseURL.path)")
        } else {
            let error = String(cString: sqlite3_errmsg(db))
            lastError = "Failed to open database: \(error)"
            print("❌ Database error: \(error)")
        }
    }
    
    private func createTables() {
        // Match the MCP server's working schema
        let createConversationsTable = """
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
        """
        
        let createMessagesTable = """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                message_uuid TEXT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp DATETIME NOT NULL,
                tool_calls TEXT,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                UNIQUE(conversation_id, message_uuid)
            );
        """
        
        let createIndexes = """
            CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
            CREATE INDEX IF NOT EXISTS idx_conversations_project_path ON conversations(project_path);
            CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
            CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
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
    
    private func checkAndRepairDatabase() {
        // Check database integrity
        var stmt: OpaquePointer?
        if sqlite3_prepare_v2(db, "PRAGMA integrity_check", -1, &stmt, nil) == SQLITE_OK {
            if sqlite3_step(stmt) == SQLITE_ROW {
                let result = String(cString: sqlite3_column_text(stmt, 0))
                if result != "ok" {
                    print("⚠️ Database integrity issues detected: \(result)")
                    print("🔧 Rebuilding database indexes...")
                    
                    // Rebuild all indexes
                    if sqlite3_exec(db, "REINDEX", nil, nil, nil) == SQLITE_OK {
                        print("✅ Database indexes rebuilt successfully")
                    } else {
                        let error = String(cString: sqlite3_errmsg(db))
                        print("❌ Failed to rebuild indexes: \(error)")
                    }
                } else {
                    print("✅ Database integrity check passed")
                }
            }
            sqlite3_finalize(stmt)
        }
    }
    
    // MARK: - Conversation Operations (replacing MCPClient calls)
    
    /// List recent conversations from local database
    /// Replaces: mcpClient.listRecentConversations()
    func listRecentConversations(limit: Int = 20, timeframe: String = "today") async throws -> [ConversationItem] {
        return try await withCheckedThrowingContinuation { continuation in
            databaseQueue.async { [weak self] in
                guard let self = self else {
                    continuation.resume(throwing: AIMemoryError.databaseError("Database manager deallocated"))
                    return
                }
                
                var stmt: OpaquePointer?
                
                let timeframeFilter = self.buildTimeframeFilter(timeframe)
                let sql = """
                    SELECT id, session_id, title, project_path, updated_at, message_count, topics, summary, has_code, has_errors
                    FROM conversations
                    WHERE updated_at >= datetime('\(timeframeFilter)')
                    ORDER BY updated_at DESC
                    LIMIT \(limit)
                """
                
                if sqlite3_prepare_v2(self.db, sql, -1, &stmt, nil) == SQLITE_OK {
                    var conversations: [ConversationItem] = []
                    
                    while sqlite3_step(stmt) == SQLITE_ROW {
                        // let conversationId = sqlite3_column_int(stmt, 0)  // Not used in ConversationItem
                        let sessionId = String(cString: sqlite3_column_text(stmt, 1))
                        let title = String(cString: sqlite3_column_text(stmt, 2))
                        let projectPath = String(cString: sqlite3_column_text(stmt, 3))
                        let updatedAtString = String(cString: sqlite3_column_text(stmt, 4))
                        let messageCount = sqlite3_column_int(stmt, 5)
                        let hasCode = sqlite3_column_int(stmt, 8) != 0
                        let hasErrors = sqlite3_column_int(stmt, 9) != 0
                        
                        let formatter = ISO8601DateFormatter()
                        let updatedAt = formatter.date(from: updatedAtString) ?? Date()
                        
                        let item = ConversationItem(
                            sessionId: sessionId,
                            title: title,
                            project: projectPath,
                            date: updatedAt,
                            messageCount: Int(messageCount),
                            hasCode: hasCode,
                            hasErrors: hasErrors
                        )
                        conversations.append(item)
                    }
                    
                    sqlite3_finalize(stmt)
                    continuation.resume(returning: conversations)
                } else {
                    let error = String(cString: sqlite3_errmsg(self.db))
                    sqlite3_finalize(stmt)
                    continuation.resume(throwing: AIMemoryError.databaseError(error))
                }
            }
        }
    }
    
    /// Get conversation context from local database
    /// Replaces: mcpClient.getConversationContext()
    func getConversationContext(sessionId: String, page: Int = 1, pageSize: Int = 50) async throws -> ConversationContext {
        return try await withCheckedThrowingContinuation { continuation in
            databaseQueue.async { [weak self] in
                guard let self = self else {
                    continuation.resume(throwing: AIMemoryError.databaseError("Database manager deallocated"))
                    return
                }
                
                do {
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
                            let contextDict: [String: Any] = [
                                "sessionId": sessionId,
                                "messages": messages.map { msg in
                                    ["role": msg.role, "content": msg.content, "timestamp": ISO8601DateFormatter().string(from: msg.timestamp)]
                                },
                                "totalMessages": Int(totalMessages),
                                "currentPage": page,
                                "totalPages": totalPages
                            ]
                            let context = try ConversationContext(from: contextDict)
                            
                            sqlite3_finalize(stmt)
                            continuation.resume(returning: context)
                        } else {
                            let error = String(cString: sqlite3_errmsg(self.db))
                            sqlite3_finalize(stmt)
                            continuation.resume(throwing: AIMemoryError.databaseError(error))
                        }
                    } else {
                        sqlite3_finalize(stmt)
                        continuation.resume(throwing: AIMemoryError.conversationNotFound)
                    }
                } else {
                    let error = String(cString: sqlite3_errmsg(self.db))
                    sqlite3_finalize(stmt)
                    continuation.resume(throwing: AIMemoryError.databaseError(error))
                }
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }
    
    /// Search conversations in local database
    /// Replaces: mcpClient.searchConversations()
    func searchConversations(query: String, limit: Int = 10) async throws -> [ConversationSearchResult] {
        return try await withCheckedThrowingContinuation { continuation in
            databaseQueue.async { [weak self] in
                guard let self = self else {
                    continuation.resume(throwing: AIMemoryError.databaseError("Database manager deallocated"))
                    return
                }
                
                var stmt: OpaquePointer?
                
                let sql = """
                    SELECT session_id, title, project_path, updated_at, summary
                    FROM conversations
                    WHERE title LIKE '%\(query)%' OR summary LIKE '%\(query)%' OR topics LIKE '%\(query)%'
                    ORDER BY updated_at DESC
                    LIMIT \(limit)
                """
                
                if sqlite3_prepare_v2(self.db, sql, -1, &stmt, nil) == SQLITE_OK {
                    var results: [ConversationSearchResult] = []
                    let formatter = ISO8601DateFormatter()
                    
                    while sqlite3_step(stmt) == SQLITE_ROW {
                        let sessionId = String(cString: sqlite3_column_text(stmt, 0))
                        let projectName = String(cString: sqlite3_column_text(stmt, 1))
                        let projectPath = String(cString: sqlite3_column_text(stmt, 2))
                        let updatedAtString = String(cString: sqlite3_column_text(stmt, 3))
                        let keywords = String(cString: sqlite3_column_text(stmt, 4))
                        
                        let updatedAt = formatter.date(from: updatedAtString) ?? Date()
                        
                        let resultDict: [String: Any] = [
                            "sessionId": sessionId,
                            "title": projectName,
                            "project": projectPath,
                            "date": ISO8601DateFormatter().string(from: updatedAt),
                            "messageCount": 0, // Would need separate query for exact count
                            "snippet": keywords,  // Use keywords as snippet
                            "hasErrors": false // Placeholder
                        ]
                        let result = try! ConversationSearchResult(from: resultDict)
                        results.append(result)
                    }
                    
                    sqlite3_finalize(stmt)
                    continuation.resume(returning: results)
                } else {
                    let error = String(cString: sqlite3_errmsg(self.db))
                    sqlite3_finalize(stmt)
                    continuation.resume(throwing: AIMemoryError.databaseError(error))
                }
            }
        }
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
        // Validate conversation data before processing
        guard !conversation.sessionId.isEmpty else {
            throw AIMemoryError.invalidData
        }
        guard !conversation.projectPath.isEmpty else {
            throw AIMemoryError.invalidData
        }
        // Note: title is now derived from project_name, no validation needed
        
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            databaseQueue.async { [weak self] in
                guard let self = self else {
                    continuation.resume(throwing: AIMemoryError.databaseError("Database manager deallocated"))
                    return
                }
                
                do {
                // Begin transaction
                var beginStmt: OpaquePointer?
                if sqlite3_prepare_v2(self.db, "BEGIN TRANSACTION", -1, &beginStmt, nil) == SQLITE_OK {
                    sqlite3_step(beginStmt)
                    sqlite3_finalize(beginStmt)
                }
                
                do {
                    // First check if conversation exists to get its ID
                    var conversationId: Int64 = -1
                    let selectSql = "SELECT id FROM conversations WHERE session_id = ?"
                    var selectStmt: OpaquePointer?
                    if sqlite3_prepare_v2(self.db, selectSql, -1, &selectStmt, nil) == SQLITE_OK {
                        sqlite3_bind_text(selectStmt, 1, conversation.sessionId, -1, nil)
                        if sqlite3_step(selectStmt) == SQLITE_ROW {
                            conversationId = sqlite3_column_int64(selectStmt, 0)
                        }
                        sqlite3_finalize(selectStmt)
                    }
                    
                    // Insert or update conversation
                    let conversationSql: String
                    if conversationId > 0 {
                        conversationSql = """
                            UPDATE conversations SET
                                project_hash = ?, project_name = ?, project_path = ?, updated_at = ?,
                                message_count = ?, file_references = ?, topics = ?, keywords = ?, total_tokens = ?
                            WHERE id = ?
                        """
                    } else {
                        conversationSql = """
                            INSERT INTO conversations (
                                session_id, project_hash, project_name, project_path, created_at, updated_at,
                                message_count, file_references, topics, keywords, total_tokens
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """
                    }
                    
                    var conversationStmt: OpaquePointer?
                    guard sqlite3_prepare_v2(self.db, conversationSql, -1, &conversationStmt, nil) == SQLITE_OK else {
                        throw AIMemoryError.databaseError("Failed to prepare conversation statement")
                    }
                    
                    defer { sqlite3_finalize(conversationStmt) }
                    
                    // Prepare data for MCP schema
                    let projectHash = conversation.projectPath.data(using: .utf8)?.base64EncodedString() ?? ""
                    let projectName = conversation.title  // Use title as project_name
                    let fileRefsJson = try? JSONSerialization.data(withJSONObject: conversation.fileReferences)
                    let fileRefsString = fileRefsJson != nil ? String(data: fileRefsJson!, encoding: .utf8) : "[]"
                    let topicsJson = try? JSONSerialization.data(withJSONObject: conversation.topics)
                    let topicsJsonString = topicsJson != nil ? String(data: topicsJson!, encoding: .utf8) : "[]"
                    let keywords = extractKeywords(from: conversation)
                    let keywordsJson = try? JSONSerialization.data(withJSONObject: keywords)
                    let keywordsString = keywordsJson != nil ? String(data: keywordsJson!, encoding: .utf8) : "[]"
                    let totalTokens = conversation.messages.reduce(0) { $0 + $1.content.count / 4 }
                    let dateFormatter = ISO8601DateFormatter()
                    let now = dateFormatter.string(from: Date())
                    
                    if conversationId > 0 {
                        // UPDATE existing conversation - MCP schema
                        sqlite3_bind_text(conversationStmt, 1, projectHash, -1, nil)
                        sqlite3_bind_text(conversationStmt, 2, projectName, -1, nil)
                        sqlite3_bind_text(conversationStmt, 3, conversation.projectPath, -1, nil)
                        sqlite3_bind_text(conversationStmt, 4, now, -1, nil)
                        sqlite3_bind_int(conversationStmt, 5, Int32(conversation.messages.count))
                        sqlite3_bind_text(conversationStmt, 6, fileRefsString, -1, nil)
                        sqlite3_bind_text(conversationStmt, 7, topicsJsonString, -1, nil)
                        sqlite3_bind_text(conversationStmt, 8, keywordsString, -1, nil)
                        sqlite3_bind_int(conversationStmt, 9, Int32(totalTokens))
                        sqlite3_bind_int64(conversationStmt, 10, conversationId)
                    } else {
                        // INSERT new conversation - MCP schema
                        sqlite3_bind_text(conversationStmt, 1, conversation.sessionId, -1, nil)
                        sqlite3_bind_text(conversationStmt, 2, projectHash, -1, nil)
                        sqlite3_bind_text(conversationStmt, 3, projectName, -1, nil)
                        sqlite3_bind_text(conversationStmt, 4, conversation.projectPath, -1, nil)
                        sqlite3_bind_text(conversationStmt, 5, now, -1, nil)
                        sqlite3_bind_text(conversationStmt, 6, now, -1, nil)
                        sqlite3_bind_int(conversationStmt, 7, Int32(conversation.messages.count))
                        sqlite3_bind_text(conversationStmt, 8, fileRefsString, -1, nil)
                        sqlite3_bind_text(conversationStmt, 9, topicsJsonString, -1, nil)
                        sqlite3_bind_text(conversationStmt, 10, keywordsString, -1, nil)
                        sqlite3_bind_int(conversationStmt, 11, Int32(totalTokens))
                    }
                    
                    guard sqlite3_step(conversationStmt) == SQLITE_DONE else {
                        throw AIMemoryError.databaseError("Failed to insert/update conversation")
                    }
                    
                    // Get the conversation ID for message insertion
                    if conversationId <= 0 {
                        conversationId = sqlite3_last_insert_rowid(self.db)
                    }
                    
                    // Delete existing messages for this conversation
                    let deleteSql = "DELETE FROM messages WHERE conversation_id = ?"
                    var deleteStmt: OpaquePointer?
                    if sqlite3_prepare_v2(self.db, deleteSql, -1, &deleteStmt, nil) == SQLITE_OK {
                        sqlite3_bind_int64(deleteStmt, 1, conversationId)
                        sqlite3_step(deleteStmt)
                        sqlite3_finalize(deleteStmt)
                    }
                    
                    // Insert messages (use INSERT OR REPLACE to handle duplicate UUIDs within same conversation)
                    let messageSql = """
                        INSERT OR REPLACE INTO messages (
                            conversation_id, message_uuid, role, content, timestamp, tool_calls
                        ) VALUES (?, ?, ?, ?, ?, ?)
                    """
                    
                    var messageStmt: OpaquePointer?
                    guard sqlite3_prepare_v2(self.db, messageSql, -1, &messageStmt, nil) == SQLITE_OK else {
                        throw AIMemoryError.databaseError("Failed to prepare message insert")
                    }
                    
                    defer { sqlite3_finalize(messageStmt) }
                    
                    print("📝 Inserting \(conversation.messages.count) messages for conversation: \(conversation.sessionId)")
                    for (index, message) in conversation.messages.enumerated() {
                        sqlite3_reset(messageStmt)
                        sqlite3_bind_int64(messageStmt, 1, conversationId)
                        sqlite3_bind_text(messageStmt, 2, message.id, -1, nil)  // message_uuid
                        sqlite3_bind_text(messageStmt, 3, message.role, -1, nil)
                        sqlite3_bind_text(messageStmt, 4, message.content, -1, nil)
                        
                        let timestampString = ISO8601DateFormatter().string(from: message.timestamp)
                        sqlite3_bind_text(messageStmt, 5, timestampString, -1, nil)
                        
                        let toolCallsJson = message.toolCalls.joined(separator: ",")
                        sqlite3_bind_text(messageStmt, 6, toolCallsJson, -1, nil)
                        
                        print("💬 Inserting message \(index + 1)/\(conversation.messages.count): ID=\(message.id), Role=\(message.role), Content=\(String(message.content.prefix(50)))...")
                        
                        let stepResult = sqlite3_step(messageStmt)
                        if stepResult != SQLITE_DONE {
                            let errorMessage = String(cString: sqlite3_errmsg(self.db))
                            print("❌ Message insertion failed at index \(index + 1):")
                            print("   SQLite Error Code: \(stepResult)")
                            print("   SQLite Error Message: \(errorMessage)")
                            print("   Message ID: \(message.id)")
                            print("   Message Role: \(message.role)")
                            print("   Content Length: \(message.content.count)")
                            print("   Tool Calls: \(message.toolCalls.count)")
                            throw AIMemoryError.databaseError("Failed to insert message \(index + 1): \(errorMessage)")
                        }
                        print("✅ Message \(index + 1) inserted successfully")
                    }
                    
                    // Delete existing file references
                    let deleteFilesSql = "DELETE FROM file_references WHERE conversation_id = ?"
                    var deleteFilesStmt: OpaquePointer?
                    if sqlite3_prepare_v2(self.db, deleteFilesSql, -1, &deleteFilesStmt, nil) == SQLITE_OK {
                        sqlite3_bind_int64(deleteFilesStmt, 1, conversationId)
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
                                sqlite3_bind_int64(fileStmt, 1, conversationId)
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
                    continuation.resume()
                    
                } catch {
                    // Rollback on error
                    var rollbackStmt: OpaquePointer?
                    if sqlite3_prepare_v2(self.db, "ROLLBACK", -1, &rollbackStmt, nil) == SQLITE_OK {
                        sqlite3_step(rollbackStmt)
                        sqlite3_finalize(rollbackStmt)
                    }
                    
                    continuation.resume(throwing: error)
                }
                }
            }
        }
    }
    
    // MARK: - Helper Methods
    
    private func extractKeywords(from conversation: IndexableConversation) -> [String] {
        var keywords = Set<String>()
        
        // Extract from title/project name
        let projectName = conversation.title.lowercased()
        keywords.formUnion(projectName.split(separator: " ").map(String.init))
        
        // Extract from topics
        keywords.formUnion(conversation.topics.map { $0.lowercased() })
        
        // Extract common programming terms from messages
        let programmingTerms = ["function", "class", "method", "variable", "database", 
                               "api", "bug", "fix", "feature", "implement", "refactor"]
        
        for message in conversation.messages {
            let lowercased = message.content.lowercased()
            for term in programmingTerms {
                if lowercased.contains(term) {
                    keywords.insert(term)
                }
            }
        }
        
        return Array(keywords).prefix(20).map(String.init)  // Limit to 20 keywords
    }
    
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

// MARK: - Supporting Data Types
// Note: Using existing types from ConversationIndexer.swift and MCPClient.swift
// - IndexableConversation, IndexableMessage: defined in ConversationIndexer.swift
// - ConversationSearchResult, ConversationContext, ConversationMessage: defined in MCPClient.swift