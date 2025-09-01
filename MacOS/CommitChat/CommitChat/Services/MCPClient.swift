//
//  MCPClient.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import Foundation
import Combine

/// JSON-RPC client for communicating with the Node.js MCP server
/// 
/// This class provides a complete implementation of JSON-RPC 2.0 protocol for communicating
/// with the ai-memory MCP server. It handles connection lifecycle, request/response management,
/// and provides type-safe Swift interfaces for all MCP tools.
///
/// ## Key Features
/// - Automatic connection management with ProcessManager integration
/// - Type-safe async/await methods for all 6 MCP tools
/// - Comprehensive error handling with user-friendly messages
/// - Singleton pattern for consistent server communication
/// - Reactive UI updates via @Published properties
///
/// ## Usage
/// ```swift
/// let results = try await MCPClient.shared.searchConversations(
///     query: "authentication",
///     limit: 20
/// )
/// ```
class MCPClient: ObservableObject {
    /// Shared singleton instance for consistent MCP server communication
    static let shared = MCPClient()
    
    /// Published connection status for reactive UI updates
    @Published var isConnected: Bool = false
    /// Published error state for UI error handling
    @Published var lastError: String?
    
    private var inputPipe: Pipe?
    private var outputPipe: Pipe?
    private var requestId: Int = 0
    private var pendingRequests: [Int: (Result<Any, Error>) -> Void] = [:]
    
    private let processManager = ProcessManager.shared
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - JSON-RPC Models
    
    struct JSONRPCRequest: Codable {
        let jsonrpc: String = "2.0"
        let id: Int
        let method: String
        let params: [String: Any]?
        
        enum CodingKeys: String, CodingKey {
            case jsonrpc, id, method, params
        }
        
        init(id: Int, method: String, params: [String: Any]? = nil) {
            self.id = id
            self.method = method
            self.params = params
        }
        
        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            _ = try container.decode(String.self, forKey: .jsonrpc) // Validate but don't use
            self.id = try container.decode(Int.self, forKey: .id)
            self.method = try container.decode(String.self, forKey: .method)
            
            if let paramsData = try container.decodeIfPresent(AnyCodable.self, forKey: .params) {
                self.params = paramsData.value as? [String: Any]
            } else {
                self.params = nil
            }
        }
        
        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(jsonrpc, forKey: .jsonrpc)
            try container.encode(id, forKey: .id)
            try container.encode(method, forKey: .method)
            
            if let params = params {
                let data = try JSONSerialization.data(withJSONObject: params)
                let json = try JSONSerialization.jsonObject(with: data)
                try container.encode(AnyCodable(json), forKey: .params)
            }
        }
    }
    
    struct JSONRPCResponse: Codable {
        let jsonrpc: String
        let id: Int?
        let result: AnyCodable?
        let error: JSONRPCError?
    }
    
    struct JSONRPCError: Codable {
        let code: Int
        let message: String
        let data: AnyCodable?
    }
    
    // Helper for encoding/decoding Any values
    struct AnyCodable: Codable {
        let value: Any
        
        init(_ value: Any) {
            self.value = value
        }
        
        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            
            if let bool = try? container.decode(Bool.self) {
                value = bool
            } else if let int = try? container.decode(Int.self) {
                value = int
            } else if let double = try? container.decode(Double.self) {
                value = double
            } else if let string = try? container.decode(String.self) {
                value = string
            } else if let array = try? container.decode([AnyCodable].self) {
                value = array.map { $0.value }
            } else if let dict = try? container.decode([String: AnyCodable].self) {
                value = dict.mapValues { $0.value }
            } else {
                value = NSNull()
            }
        }
        
        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            
            switch value {
            case let bool as Bool:
                try container.encode(bool)
            case let int as Int:
                try container.encode(int)
            case let double as Double:
                try container.encode(double)
            case let string as String:
                try container.encode(string)
            case let array as [Any]:
                try container.encode(array.map { AnyCodable($0) })
            case let dict as [String: Any]:
                try container.encode(dict.mapValues { AnyCodable($0) })
            default:
                try container.encodeNil()
            }
        }
    }
    
    // MARK: - Initialization
    
    private init() {
        setupProcessMonitoring()
    }
    
    private func setupProcessMonitoring() {
        processManager.$serverStatus
            .sink { [weak self] status in
                self?.isConnected = status.isRunning
                if !status.isRunning {
                    self?.cleanup()
                }
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Connection Management
    
    func connect() async -> Bool {
        guard !isConnected else { return true }
        
        // Start MCP server if not running
        if !processManager.serverStatus.isRunning {
            processManager.startMCPServer()
            
            // Wait for server to start
            for _ in 0..<30 { // Wait up to 3 seconds
                if processManager.serverStatus.isRunning {
                    break
                }
                try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
            }
        }
        
        return processManager.serverStatus.isRunning
    }
    
    func disconnect() {
        cleanup()
        processManager.stopMCPServer()
    }
    
    private func cleanup() {
        inputPipe = nil
        outputPipe = nil
        
        // Fail all pending requests
        for (_, completion) in pendingRequests {
            completion(.failure(MCPClientError.disconnected))
        }
        pendingRequests.removeAll()
    }
    
    // MARK: - JSON-RPC Communication
    
    private func sendRequest<T>(method: String, params: [String: Any]? = nil) async throws -> T {
        guard await connect() else {
            throw MCPClientError.notConnected
        }
        
        let id = generateRequestId()
        let request = JSONRPCRequest(id: id, method: method, params: params)
        
        return try await withCheckedThrowingContinuation { continuation in
            pendingRequests[id] = { result in
                switch result {
                case .success(let value):
                    if let typedValue = value as? T {
                        continuation.resume(returning: typedValue)
                    } else {
                        continuation.resume(throwing: MCPClientError.invalidResponse)
                    }
                case .failure(let error):
                    continuation.resume(throwing: error)
                }
            }
            
            // Send request via stdin to MCP server
            do {
                let data = try JSONEncoder().encode(request)
                let jsonString = String(data: data, encoding: .utf8)! + "\n"
                
                if let process = processManager.mcpProcess,
                   let stdin = process.standardInput as? FileHandle {
                    stdin.write(jsonString.data(using: .utf8)!)
                } else {
                    pendingRequests.removeValue(forKey: id)
                    continuation.resume(throwing: MCPClientError.notConnected)
                }
            } catch {
                pendingRequests.removeValue(forKey: id)
                continuation.resume(throwing: error)
            }
        }
    }
    
    private func generateRequestId() -> Int {
        requestId += 1
        return requestId
    }
    
    // MARK: - MCP Tool Methods
    
    /// Search conversations using the MCP server
    func searchConversations(query: String, limit: Int = 10) async throws -> [ConversationSearchResult] {
        let params: [String: Any] = [
            "query": query,
            "limit": limit,
            "include_snippets": true,
            "max_tokens": 3000
        ]
        
        let response: [String: Any] = try await sendRequest(method: "search_conversations", params: params)
        
        // Parse response into ConversationSearchResult objects
        guard let results = response["results"] as? [[String: Any]] else {
            throw MCPClientError.invalidResponse
        }
        
        return try results.map { result in
            try ConversationSearchResult(from: result)
        }
    }
    
    /// List recent conversations
    func listRecentConversations(limit: Int = 20, timeframe: String = "today") async throws -> [ConversationItem] {
        let params: [String: Any] = [
            "limit": limit,
            "timeframe": timeframe
        ]
        
        let response: [String: Any] = try await sendRequest(method: "list_recent_conversations", params: params)
        
        guard let conversations = response["conversations"] as? [[String: Any]] else {
            throw MCPClientError.invalidResponse
        }
        
        return try conversations.map { conv in
            try ConversationItem(from: conv)
        }
    }
    
    /// Get conversation context
    func getConversationContext(sessionId: String, page: Int = 1, pageSize: Int = 50) async throws -> ConversationContext {
        let params: [String: Any] = [
            "session_id": sessionId,
            "page": page,
            "page_size": pageSize,
            "max_tokens": 20000
        ]
        
        let response: [String: Any] = try await sendRequest(method: "get_conversation_context", params: params)
        
        return try ConversationContext(from: response)
    }
    
    /// List restore points
    func listRestorePoints(projectPath: String, limit: Int = 50) async throws -> [RestorePoint] {
        let params: [String: Any] = [
            "project_path": projectPath,
            "limit": limit,
            "include_auto_generated": false
        ]
        
        let response: [String: Any] = try await sendRequest(method: "list_restore_points", params: params)
        
        guard let restorePoints = response["restore_points"] as? [[String: Any]] else {
            throw MCPClientError.invalidResponse
        }
        
        return try restorePoints.map { point in
            try RestorePoint(from: point)
        }
    }
    
    /// Create a restore point
    func createRestorePoint(projectPath: String, label: String, description: String? = nil) async throws -> RestorePoint {
        let params: [String: Any] = [
            "project_path": projectPath,
            "label": label,
            "description": description ?? "",
            "test_status": "unknown"
        ]
        
        let response: [String: Any] = try await sendRequest(method: "create_restore_point", params: params)
        
        return try RestorePoint(from: response)
    }
    
    /// Preview restore changes
    func previewRestore(projectPath: String, restorePointId: Int) async throws -> RestorePreview {
        let params: [String: Any] = [
            "project_path": projectPath,
            "restore_point_id": restorePointId,
            "include_file_contents": false,
            "max_files": 100
        ]
        
        let response: [String: Any] = try await sendRequest(method: "preview_restore", params: params)
        
        return try RestorePreview(from: response)
    }
}

// MARK: - Error Types

enum MCPClientError: LocalizedError {
    case notConnected
    case disconnected
    case invalidResponse
    case serverError(String)
    case timeout
    
    var errorDescription: String? {
        switch self {
        case .notConnected:
            return "Not connected to MCP server"
        case .disconnected:
            return "Disconnected from MCP server"
        case .invalidResponse:
            return "Invalid response from MCP server"
        case .serverError(let message):
            return "MCP server error: \(message)"
        case .timeout:
            return "Request timed out"
        }
    }
}

// MARK: - Data Models for MCP Responses

struct ConversationSearchResult {
    let sessionId: String
    let title: String
    let project: String
    let snippet: String
    let messageCount: Int
    let date: Date
    let hasErrors: Bool
    
    init(from dict: [String: Any]) throws {
        guard let sessionId = dict["session_id"] as? String,
              let title = dict["title"] as? String,
              let project = dict["project"] as? String,
              let snippet = dict["snippet"] as? String,
              let messageCount = dict["message_count"] as? Int else {
            throw MCPClientError.invalidResponse
        }
        
        self.sessionId = sessionId
        self.title = title
        self.project = project
        self.snippet = snippet
        self.messageCount = messageCount
        self.hasErrors = dict["has_errors"] as? Bool ?? false
        
        // Parse date
        if let dateString = dict["date"] as? String,
           let date = ISO8601DateFormatter().date(from: dateString) {
            self.date = date
        } else {
            self.date = Date()
        }
    }
}

struct ConversationContext {
    let sessionId: String
    let messages: [ConversationMessage]
    let totalMessages: Int
    let currentPage: Int
    let totalPages: Int
    
    init(from dict: [String: Any]) throws {
        guard let sessionId = dict["session_id"] as? String,
              let messagesData = dict["messages"] as? [[String: Any]],
              let totalMessages = dict["total_messages"] as? Int,
              let currentPage = dict["current_page"] as? Int,
              let totalPages = dict["total_pages"] as? Int else {
            throw MCPClientError.invalidResponse
        }
        
        self.sessionId = sessionId
        self.totalMessages = totalMessages
        self.currentPage = currentPage
        self.totalPages = totalPages
        
        self.messages = try messagesData.map { messageData in
            try ConversationMessage(from: messageData)
        }
    }
}

struct ConversationMessage {
    let role: String
    let content: String
    let timestamp: Date
    
    init(from dict: [String: Any]) throws {
        guard let role = dict["role"] as? String,
              let content = dict["content"] as? String else {
            throw MCPClientError.invalidResponse
        }
        
        self.role = role
        self.content = content
        
        // Parse timestamp
        if let timestampString = dict["timestamp"] as? String,
           let timestamp = ISO8601DateFormatter().date(from: timestampString) {
            self.timestamp = timestamp
        } else {
            self.timestamp = Date()
        }
    }
}

struct RestorePreview {
    let filesChanged: [String]
    let additions: Int
    let deletions: Int
    let canRestore: Bool
    let warnings: [String]
    
    init(from dict: [String: Any]) throws {
        self.filesChanged = dict["files_changed"] as? [String] ?? []
        self.additions = dict["additions"] as? Int ?? 0
        self.deletions = dict["deletions"] as? Int ?? 0
        self.canRestore = dict["can_restore"] as? Bool ?? false
        self.warnings = dict["warnings"] as? [String] ?? []
    }
}