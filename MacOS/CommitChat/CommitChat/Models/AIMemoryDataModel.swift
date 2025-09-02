//
//  AIMemoryDataModelFixed.swift
//  CommitChat
//
//  Created on 2025-09-02.
//  CORRUPTION FIX: Improved SQLite practices to eliminate line 106515 corruption
//

import Foundation
import SQLite3
import Combine
import os

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

/// CORRUPTION-FIXED SQLite database manager
/// 
/// FIXES APPLIED TO ELIMINATE 'index corruption at line 106515':
/// 1. Improved transaction management with explicit BEGIN/COMMIT
/// 2. Better prepared statement lifecycle management
/// 3. Batch size limiting to prevent memory pressure
/// 4. Enhanced error handling with rollback capability
/// 5. WAL mode for better concurrency
/// 6. Proper index management
class AIMemoryDataManagerFixed: ObservableObject, @unchecked Sendable {
    static let shared = AIMemoryDataManagerFixed()
    private static let logger = Logger(subsystem: "com.commitchat", category: "AIMemoryDataManager")
    
    @Published var isInitialized: Bool = false
    @Published var lastError: String?
    
    // MARK: - SQLite Database - CORRUPTION FIXES APPLIED
    
    private var db: OpaquePointer?
    private let databaseURL: URL
    private let databaseQueue = DispatchQueue(label: "com.commitchat.database.fixed", qos: .background)
    
    // CORRUPTION FIX 1: Batch processing constants
    private let BATCH_SIZE = 50 // Process messages in smaller batches
    private let MAX_RETRIES = 3
    
    // MARK: - Initialization with Corruption Fixes
    
    private init() {
        Self.logger.debug("🔧 Starting initialization with corruption fixes...")
        
        // Store database in Application Support directory
        let appSupportURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let appDirectory = appSupportURL.appendingPathComponent("CommitChat")
        Self.logger.debug("🔧 App directory: \(appDirectory.path)")
        
        // Create directory if needed
        do {
            try FileManager.default.createDirectory(at: appDirectory, withIntermediateDirectories: true)
            Self.logger.debug("🔧 Directory created/verified")
        } catch {
            Self.logger.error("❌ Failed to create directory: \(error)")
        }
        
        // ARCHITECTURE: Swift App owns database, MCP Server queries it
        // Use the same database location as MCP server for unified data
        let claudeAIMemoryDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".claude/ai-memory")
        try? FileManager.default.createDirectory(at: claudeAIMemoryDir, withIntermediateDirectories: true)
        databaseURL = claudeAIMemoryDir.appendingPathComponent("conversations.db")
        Self.logger.debug("🔧 Database URL: \(self.databaseURL.path)")
        
        initializeDatabase()
    }
    
    private func initializeDatabase() {
        // Open SQLite database with corruption-resistant settings
        if sqlite3_open(databaseURL.path, &db) == SQLITE_OK {
            // Log SQLite version
            let versionQuery = "SELECT sqlite_version();"
            var statement: OpaquePointer?
            if sqlite3_prepare_v2(db, versionQuery, -1, &statement, nil) == SQLITE_OK {
                if sqlite3_step(statement) == SQLITE_ROW {
                    let version = String(cString: sqlite3_column_text(statement, 0))
                    Self.logger.debug("🔍 SQLite version: \(version)")
                }
                sqlite3_finalize(statement)
            }
            
            // CORRUPTION FIX 2: Enable WAL mode for better concurrency
            configureDatabase()
            createTables()
            checkAndRepairDatabase()
            isInitialized = true
            Self.logger.debug("✅ AIMemoryDataManagerFixed initialized with corruption fixes at: \(self.databaseURL.path)")
        } else {
            let error = String(cString: sqlite3_errmsg(db))
            lastError = "Failed to open database: \(error)"
            Self.logger.error("❌ Database error: \(error)")
        }
    }
    
    // CORRUPTION FIX 2: Database configuration for reliability
    private func configureDatabase() {
        guard db != nil else { return }
        
        // Enable WAL mode for better concurrency and corruption resistance
        executeSQL("PRAGMA journal_mode = WAL;")
        
        // Set reasonable timeouts
        executeSQL("PRAGMA busy_timeout = 5000;")
        
        // Enable foreign key constraints
        executeSQL("PRAGMA foreign_keys = ON;")
        
        // Optimize for reliability over speed
        executeSQL("PRAGMA synchronous = NORMAL;") // Balance between safety and performance
        executeSQL("PRAGMA cache_size = 10000;") // Reasonable cache size
        executeSQL("PRAGMA temp_store = MEMORY;") // Use memory for temp storage
        
        Self.logger.debug("✅ Database configured with corruption-resistant settings")
    }
    
    private func createTables() {
        // Match the MCP server's working schema exactly
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
                file_references TEXT,
                topics TEXT,
                keywords TEXT,
                total_tokens INTEGER DEFAULT 0
            );
        """
        
        let createMessagesTable = """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                message_index INTEGER NOT NULL,
                uuid TEXT,
                timestamp DATETIME,
                role TEXT NOT NULL,
                content_type TEXT,
                content TEXT,
                content_summary TEXT,
                tool_calls TEXT,
                file_references TEXT,
                tokens INTEGER DEFAULT 0,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
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
        
        Self.logger.debug("✅ Tables created with corruption-resistant schema")
    }
    
    private func executeSQL(_ sql: String) {
        if sqlite3_exec(db, sql, nil, nil, nil) != SQLITE_OK {
            let error = String(cString: sqlite3_errmsg(db))
            Self.logger.error("❌ SQL error: \(error)")
        }
    }
    
    private func checkAndRepairDatabase() {
        // Check database integrity
        var stmt: OpaquePointer?
        if sqlite3_prepare_v2(db, "PRAGMA integrity_check", -1, &stmt, nil) == SQLITE_OK {
            if sqlite3_step(stmt) == SQLITE_ROW {
                let result = String(cString: sqlite3_column_text(stmt, 0))
                if result != "ok" {
                    Self.logger.warning("⚠️ Database integrity issues detected: \(result)")
                    Self.logger.debug("🔧 Rebuilding database indexes...")
                    
                    // Rebuild all indexes
                    if sqlite3_exec(db, "REINDEX", nil, nil, nil) == SQLITE_OK {
                        Self.logger.debug("✅ Database indexes rebuilt successfully")
                    } else {
                        let error = String(cString: sqlite3_errmsg(db))
                        Self.logger.error("❌ Failed to rebuild indexes: \(error)")
                    }
                } else {
                    Self.logger.debug("✅ Database integrity check passed")
                }
            }
            sqlite3_finalize(stmt)
        }
    }
    
    // MARK: - CORRUPTION FIX 3: Improved Bulk Message Insertion
    
    /// CORRUPTION-FIXED conversation indexing with batched message insertion
    /// This replaces the corrupting lines 539-567 in the original implementation
    func indexConversation(_ conversation: IndexableConversation) async throws {
        // Validate conversation data
        guard !conversation.sessionId.isEmpty else {
            throw AIMemoryError.invalidData
        }
        guard !conversation.projectPath.isEmpty else {
            throw AIMemoryError.invalidData
        }
        
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            databaseQueue.async { [weak self] in
                guard let self = self else {
                    continuation.resume(throwing: AIMemoryError.databaseError("Database manager deallocated"))
                    return
                }
                
                do {
                    try self.indexConversationSafely(conversation)
                    continuation.resume()
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }
    
    private func indexConversationSafely(_ conversation: IndexableConversation) throws {
        guard let db = db else {
            throw AIMemoryError.databaseError("Database not initialized")
        }
        
        // CORRUPTION FIX 3: Explicit transaction management with rollback capability
        var beginStmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, "BEGIN IMMEDIATE TRANSACTION", -1, &beginStmt, nil) == SQLITE_OK else {
            throw AIMemoryError.databaseError("Failed to begin transaction")
        }
        
        guard sqlite3_step(beginStmt) == SQLITE_DONE else {
            sqlite3_finalize(beginStmt)
            throw AIMemoryError.databaseError("Failed to start transaction")
        }
        sqlite3_finalize(beginStmt)
        
        do {
            // Insert/update conversation
            let conversationId = try insertOrUpdateConversation(conversation)
            
            // CORRUPTION FIX 4: Batched message insertion with retry logic
            try insertMessagesBatched(conversationId: conversationId, messages: conversation.messages)
            
            // Insert file references
            try insertFileReferences(conversationId: conversationId, fileReferences: conversation.fileReferences)
            
            // Commit transaction
            var commitStmt: OpaquePointer?
            if sqlite3_prepare_v2(db, "COMMIT TRANSACTION", -1, &commitStmt, nil) == SQLITE_OK {
                if sqlite3_step(commitStmt) == SQLITE_DONE {
                    Self.logger.debug("✅ Conversation indexed successfully: \(conversation.sessionId)")
                } else {
                    throw AIMemoryError.databaseError("Failed to commit transaction")
                }
                sqlite3_finalize(commitStmt)
            }
            
        } catch {
            // CORRUPTION FIX 5: Proper rollback on error
            var rollbackStmt: OpaquePointer?
            if sqlite3_prepare_v2(db, "ROLLBACK TRANSACTION", -1, &rollbackStmt, nil) == SQLITE_OK {
                sqlite3_step(rollbackStmt)
                sqlite3_finalize(rollbackStmt)
            }
            Self.logger.error("❌ Transaction rolled back due to error: \(error)")
            throw error
        }
    }
    
    private func insertOrUpdateConversation(_ conversation: IndexableConversation) throws -> Int64 {
        guard let db = db else {
            throw AIMemoryError.databaseError("Database not initialized")
        }
        
        let now = Date()
        
        print("🔍 DEBUG insertOrUpdateConversation: incoming sessionId = '\(conversation.sessionId)', length = \(conversation.sessionId.count)")
        
        // CRITICAL FIX: Handle empty sessionId to prevent all conversations overwriting each other
        let sessionIdToUse: String
        if conversation.sessionId.isEmpty {
            sessionIdToUse = UUID().uuidString
            print("❌ CRITICAL: Empty sessionId detected! Generated: \(sessionIdToUse)")
            print("❌ Title: \(conversation.title), Project: \(conversation.projectPath)")
            Self.logger.error("❌ CRITICAL: Empty sessionId detected! Generated: \(sessionIdToUse)")
            Self.logger.error("❌ Title: \(conversation.title), Project: \(conversation.projectPath)")
        } else {
            sessionIdToUse = conversation.sessionId
            print("✅ Using sessionId: '\(sessionIdToUse)'")
            Self.logger.debug("✅ Using sessionId: '\(sessionIdToUse)'")
        }
        
        // Check if conversation exists
        var conversationId: Int64 = -1
        let selectSql = "SELECT id FROM conversations WHERE session_id = ?"
        var selectStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, selectSql, -1, &selectStmt, nil) == SQLITE_OK {
            sqlite3_bind_text(selectStmt, 1, sessionIdToUse, -1, nil)
            if sqlite3_step(selectStmt) == SQLITE_ROW {
                conversationId = sqlite3_column_int64(selectStmt, 0)
            }
            sqlite3_finalize(selectStmt)
        }
        
        // Prepare conversation data
        let projectHash = conversation.projectPath.data(using: .utf8)?.base64EncodedString() ?? ""
        let projectName = conversation.title
        let fileRefsJson = try? JSONSerialization.data(withJSONObject: conversation.fileReferences)
        let fileRefsString = fileRefsJson != nil ? String(data: fileRefsJson!, encoding: .utf8) : "[]"
        let topicsJson = try? JSONSerialization.data(withJSONObject: conversation.topics)
        let topicsString = topicsJson != nil ? String(data: topicsJson!, encoding: .utf8) : "[]"
        let keywords = extractKeywords(from: conversation)
        let keywordsJson = try? JSONSerialization.data(withJSONObject: keywords)
        let keywordsString = keywordsJson != nil ? String(data: keywordsJson!, encoding: .utf8) : "[]"
        let totalTokens = conversation.messages.reduce(0) { $0 + $1.content.count / 4 }
        let dateFormatter = ISO8601DateFormatter()
        let nowString = dateFormatter.string(from: now)
        
        if conversationId > 0 {
            // Update existing
            let updateSql = """
                UPDATE conversations SET
                    project_hash = ?, project_name = ?, project_path = ?, updated_at = ?,
                    message_count = ?, file_references = ?, topics = ?, keywords = ?, total_tokens = ?
                WHERE id = ?
            """
            var updateStmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, updateSql, -1, &updateStmt, nil) == SQLITE_OK else {
                throw AIMemoryError.databaseError("Failed to prepare update statement")
            }
            
            defer { sqlite3_finalize(updateStmt) }
            
            sqlite3_bind_text(updateStmt, 1, projectHash, -1, nil)
            sqlite3_bind_text(updateStmt, 2, projectName, -1, nil)
            sqlite3_bind_text(updateStmt, 3, conversation.projectPath, -1, nil)
            sqlite3_bind_text(updateStmt, 4, nowString, -1, nil)
            sqlite3_bind_int(updateStmt, 5, Int32(conversation.messages.count))
            sqlite3_bind_text(updateStmt, 6, fileRefsString, -1, nil)
            sqlite3_bind_text(updateStmt, 7, topicsString, -1, nil)
            sqlite3_bind_text(updateStmt, 8, keywordsString, -1, nil)
            sqlite3_bind_int(updateStmt, 9, Int32(totalTokens))
            sqlite3_bind_int64(updateStmt, 10, conversationId)
            
            guard sqlite3_step(updateStmt) == SQLITE_DONE else {
                throw AIMemoryError.databaseError("Failed to update conversation")
            }
            
        } else {
            // Insert new
            let insertSql = """
                INSERT INTO conversations (
                    session_id, project_hash, project_name, project_path, created_at, updated_at,
                    message_count, file_references, topics, keywords, total_tokens
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            var insertStmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, insertSql, -1, &insertStmt, nil) == SQLITE_OK else {
                throw AIMemoryError.databaseError("Failed to prepare insert statement")
            }
            
            defer { sqlite3_finalize(insertStmt) }
            
            print("🔍 DEBUG INSERT: About to bind sessionId = '\(sessionIdToUse)' length=\(sessionIdToUse.count) at position 1")
            Self.logger.debug("🔍 INSERT: Binding sessionId = '\(sessionIdToUse)' at position 1")
            
            // Use withCString to ensure string stays valid during binding
            let result = sessionIdToUse.withCString { cString in
                sqlite3_bind_text(insertStmt, 1, cString, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
            }
            print("🔍 DEBUG INSERT: sqlite3_bind_text result = \(result) (SQLITE_OK=\(SQLITE_OK))")
            sqlite3_bind_text(insertStmt, 2, projectHash, -1, nil)
            sqlite3_bind_text(insertStmt, 3, projectName, -1, nil)
            sqlite3_bind_text(insertStmt, 4, conversation.projectPath, -1, nil)
            sqlite3_bind_text(insertStmt, 5, nowString, -1, nil)
            sqlite3_bind_text(insertStmt, 6, nowString, -1, nil)
            sqlite3_bind_int(insertStmt, 7, Int32(conversation.messages.count))
            sqlite3_bind_text(insertStmt, 8, fileRefsString, -1, nil)
            sqlite3_bind_text(insertStmt, 9, topicsString, -1, nil)
            sqlite3_bind_text(insertStmt, 10, keywordsString, -1, nil)
            sqlite3_bind_int(insertStmt, 11, Int32(totalTokens))
            
            guard sqlite3_step(insertStmt) == SQLITE_DONE else {
                throw AIMemoryError.databaseError("Failed to insert conversation")
            }
            
            conversationId = sqlite3_last_insert_rowid(db)
        }
        
        return conversationId
    }
    
    // CORRUPTION FIX 4: Batched message insertion to prevent corruption
    private func insertMessagesBatched(conversationId: Int64, messages: [IndexableMessage]) throws {
        guard let db = db else {
            throw AIMemoryError.databaseError("Database not initialized")
        }
        
        // Delete existing messages first
        let deleteSql = "DELETE FROM messages WHERE conversation_id = ?"
        var deleteStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, deleteSql, -1, &deleteStmt, nil) == SQLITE_OK {
            sqlite3_bind_int64(deleteStmt, 1, conversationId)
            sqlite3_step(deleteStmt)
            sqlite3_finalize(deleteStmt)
        }
        
        Self.logger.debug("📝 CORRUPTION-FIX: Inserting \(messages.count) messages in batches of \(self.BATCH_SIZE)...")
        
        // Process messages in batches to prevent corruption
        let batches = messages.chunked(into: BATCH_SIZE)
        
        for (batchIndex, batch) in batches.enumerated() {
            var retryCount = 0
            var batchSuccess = false
            
            while !batchSuccess && retryCount < MAX_RETRIES {
                do {
                    try insertMessageBatch(conversationId: conversationId, batch: batch, batchIndex: batchIndex)
                    batchSuccess = true
                    Self.logger.debug("✅ BATCH \(batchIndex + 1)/\(batches.count) completed: \(batch.count) messages")
                } catch {
                    retryCount += 1
                    Self.logger.warning("⚠️ BATCH \(batchIndex + 1) failed (retry \(retryCount)/\(self.MAX_RETRIES)): \(error)")
                    
                    if retryCount >= MAX_RETRIES {
                        throw AIMemoryError.databaseError("Failed to insert message batch after \(self.MAX_RETRIES) retries: \(error)")
                    }
                    
                    // Brief delay before retry
                    Thread.sleep(forTimeInterval: 0.1)
                }
            }
        }
        
        Self.logger.debug("🎉 CORRUPTION-FIX: All \(messages.count) messages inserted successfully in \(batches.count) batches")
    }
    
    private func insertMessageBatch(conversationId: Int64, batch: [IndexableMessage], batchIndex: Int) throws {
        guard let db = db else {
            throw AIMemoryError.databaseError("Database not initialized")
        }
        
        let messageSql = """
            INSERT OR REPLACE INTO messages (
                conversation_id, message_index, uuid, role, content_type, content, timestamp, tool_calls, file_references, tokens
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        var messageStmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, messageSql, -1, &messageStmt, nil) == SQLITE_OK else {
            throw AIMemoryError.databaseError("Failed to prepare message insert statement")
        }
        
        defer { sqlite3_finalize(messageStmt) }
        
        for (index, message) in batch.enumerated() {
            sqlite3_reset(messageStmt)
            sqlite3_bind_int64(messageStmt, 1, conversationId)
            sqlite3_bind_int64(messageStmt, 2, Int64(index)) // message_index
            sqlite3_bind_text(messageStmt, 3, message.id, -1, nil) // uuid
            sqlite3_bind_text(messageStmt, 4, message.role, -1, nil) // role
            sqlite3_bind_text(messageStmt, 5, "text", -1, nil) // content_type
            sqlite3_bind_text(messageStmt, 6, message.content, -1, nil) // content
            
            let timestampString = ISO8601DateFormatter().string(from: message.timestamp)
            sqlite3_bind_text(messageStmt, 7, timestampString, -1, nil) // timestamp
            
            let toolCallsJson = message.toolCalls.joined(separator: ",")
            sqlite3_bind_text(messageStmt, 8, toolCallsJson, -1, nil) // tool_calls
            sqlite3_bind_text(messageStmt, 9, "[]", -1, nil) // file_references (empty JSON array)
            sqlite3_bind_int(messageStmt, 10, Int32(message.content.count)) // tokens (approximate)
            
            let stepResult = sqlite3_step(messageStmt)
            if stepResult != SQLITE_DONE {
                let errorMessage = String(cString: sqlite3_errmsg(db))
                throw AIMemoryError.databaseError("Failed to insert message \(index + 1) in batch \(batchIndex + 1): \(errorMessage)")
            }
        }
    }
    
    private func insertFileReferences(conversationId: Int64, fileReferences: [String]) throws {
        guard !fileReferences.isEmpty else { return }
        guard let db = db else {
            throw AIMemoryError.databaseError("Database not initialized")
        }
        
        // Delete existing file references first
        let deleteFilesSql = "DELETE FROM file_references WHERE conversation_id = ?"
        var deleteFilesStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, deleteFilesSql, -1, &deleteFilesStmt, nil) == SQLITE_OK {
            sqlite3_bind_int64(deleteFilesStmt, 1, conversationId)
            sqlite3_step(deleteFilesStmt)
            sqlite3_finalize(deleteFilesStmt)
        }
        
        // Insert file references
        let fileSql = """
            INSERT INTO file_references (conversation_id, file_path)
            VALUES (?, ?)
        """
        
        var fileStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, fileSql, -1, &fileStmt, nil) == SQLITE_OK {
            defer { sqlite3_finalize(fileStmt) }
            
            for filePath in fileReferences {
                sqlite3_reset(fileStmt)
                sqlite3_bind_int64(fileStmt, 1, conversationId)
                sqlite3_bind_text(fileStmt, 2, filePath, -1, nil)
                sqlite3_step(fileStmt)
            }
        }
    }
    
    // Helper method for keyword extraction
    private func extractKeywords(from conversation: IndexableConversation) -> [String] {
        var keywords: [String] = []
        
        // Extract from title
        let titleWords = conversation.title.components(separatedBy: .whitespacesAndNewlines)
            .filter { $0.count > 2 }
        keywords.append(contentsOf: titleWords)
        
        // Extract from file references
        for filePath in conversation.fileReferences {
            let fileName = URL(fileURLWithPath: filePath).lastPathComponent
            let nameComponents = fileName.components(separatedBy: CharacterSet(charactersIn: ".-_"))
                .filter { $0.count > 2 }
            keywords.append(contentsOf: nameComponents)
        }
        
        return Array(Set(keywords)) // Remove duplicates
    }
}

// MARK: - Helper Extensions

extension Array {
    func chunked(into size: Int) -> [[Element]] {
        return stride(from: 0, to: count, by: size).map {
            Array(self[$0..<Swift.min($0 + size, count)])
        }
    }
}

// MARK: - Compatibility Methods (placeholder implementations)

extension AIMemoryDataManagerFixed {
    /// List recent conversations (placeholder - implement as needed)
    func listRecentConversations(limit: Int = 20, timeframe: String = "today") async throws -> [ConversationItem] {
        // TODO: Implement using the fixed database
        return []
    }
    
    /// Search conversations (placeholder - implement as needed)
    func searchConversations(query: String, limit: Int = 50) async throws -> [ConversationSearchResult] {
        // TODO: Implement FTS search using the fixed database
        return []
    }
    
    /// Get conversation context (placeholder - implement as needed)
    func getConversationContext(sessionId: String, page: Int = 1, pageSize: Int = 50) async throws -> ConversationContext {
        // TODO: Implement using the fixed database
        return try ConversationContext(from: [
            "sessionId": sessionId,
            "messages": [],
            "pagination": [
                "totalMessages": 0,
                "page": page,
                "totalPages": 0,
                "pageSize": pageSize
            ]
        ])
    }
}