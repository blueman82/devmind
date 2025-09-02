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
            context.perform {
                let request: NSFetchRequest<Conversation> = Conversation.fetchRequest()
                
                // Apply timeframe filter
                if let timeframeDate = self.parseTimeframe(timeframe) {
                    request.predicate = NSPredicate(format: "lastUpdated >= %@", timeframeDate as NSDate)
                }
                
                request.sortDescriptors = [
                    NSSortDescriptor(key: "lastUpdated", ascending: false)
                ]
                request.fetchLimit = limit
                
                do {
                    let conversations = try self.context.fetch(request)
                    let items = conversations.map { conversation in
                        ConversationItem(
                            id: conversation.id?.uuidString ?? UUID().uuidString,
                            sessionId: conversation.sessionId ?? "",
                            title: conversation.title ?? "Untitled Conversation",
                            project: conversation.project ?? "Unknown Project",
                            lastModified: conversation.lastUpdated ?? Date(),
                            messageCount: Int(conversation.messageCount),
                            topics: conversation.topicsArray,
                            summary: conversation.summary ?? ""
                        )
                    }
                    continuation.resume(returning: items)
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }
    
    /// Get conversation context from local database
    /// Replaces: mcpClient.getConversationContext()
    func getConversationContext(sessionId: String, page: Int = 1, pageSize: Int = 50) async throws -> ConversationContext {
        return try await withCheckedThrowingContinuation { continuation in
            context.perform {
                // Find conversation by session ID
                let conversationRequest: NSFetchRequest<Conversation> = Conversation.fetchRequest()
                conversationRequest.predicate = NSPredicate(format: "sessionId == %@", sessionId)
                
                do {
                    guard let conversation = try self.context.fetch(conversationRequest).first else {
                        continuation.resume(throwing: AIMemoryError.conversationNotFound)
                        return
                    }
                    
                    // Fetch messages for this conversation with pagination
                    let messageRequest: NSFetchRequest<Message> = Message.fetchRequest()
                    messageRequest.predicate = NSPredicate(format: "conversation == %@", conversation)
                    messageRequest.sortDescriptors = [
                        NSSortDescriptor(key: "messageIndex", ascending: true)
                    ]
                    
                    let offset = (page - 1) * pageSize
                    messageRequest.fetchOffset = offset
                    messageRequest.fetchLimit = pageSize
                    
                    let messages = try self.context.fetch(messageRequest)
                    
                    let messageItems = messages.map { message in
                        MessageItem(
                            role: message.role ?? "unknown",
                            content: message.contentSummary ?? "",
                            timestamp: message.timestamp ?? Date(),
                            toolCalls: message.toolCallsArray
                        )
                    }
                    
                    let context = ConversationContext(
                        sessionId: sessionId,
                        messages: messageItems,
                        totalMessages: Int(conversation.messageCount),
                        currentPage: page,
                        totalPages: Int(ceil(Double(conversation.messageCount) / Double(pageSize)))
                    )
                    
                    continuation.resume(returning: context)
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
            context.perform {
                let request: NSFetchRequest<Conversation> = Conversation.fetchRequest()
                
                // Simple text search - in full implementation, this would use Core Data's
                // full-text search capabilities or SQLite FTS5
                let searchPredicate = NSPredicate(format: "title CONTAINS[cd] %@ OR summary CONTAINS[cd] %@ OR topics CONTAINS[cd] %@", 
                                                query, query, query)
                request.predicate = searchPredicate
                request.sortDescriptors = [
                    NSSortDescriptor(key: "lastUpdated", ascending: false)
                ]
                request.fetchLimit = limit
                
                do {
                    let conversations = try self.context.fetch(request)
                    let results = conversations.map { conversation in
                        ConversationSearchResult(
                            sessionId: conversation.sessionId ?? "",
                            title: conversation.title ?? "Untitled",
                            project: conversation.project ?? "Unknown",
                            lastModified: conversation.lastUpdated ?? Date(),
                            relevanceScore: 0.8, // Placeholder - would implement proper scoring
                            matchedContent: conversation.summary ?? ""
                        )
                    }
                    continuation.resume(returning: results)
                } catch {
                    continuation.resume(throwing: error)
                }
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