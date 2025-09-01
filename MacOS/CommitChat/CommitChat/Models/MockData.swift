//
//  MockData.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import Foundation
import SwiftUI

// MARK: - Mock Data Models for Phase 2 Testing

/// Mock conversation item for UI testing
/// - Note: Will be replaced with actual MCP data models in Phase 3
struct ConversationItem: Identifiable {
    let id = UUID()
    let title: String
    let project: String
    let date: Date
    let messageCount: Int
    let hasCode: Bool
    let hasErrors: Bool
    
    /// Traditional initializer for mock data and direct construction
    init(title: String, project: String, date: Date, messageCount: Int, hasCode: Bool, hasErrors: Bool) {
        self.title = title
        self.project = project
        self.date = date
        self.messageCount = messageCount
        self.hasCode = hasCode
        self.hasErrors = hasErrors
    }
    
    /// Initialize from MCP search result data
    init(from searchResult: ConversationSearchResult) {
        self.title = searchResult.title
        self.project = searchResult.project
        self.date = searchResult.date
        self.messageCount = searchResult.messageCount
        self.hasCode = searchResult.snippet.contains("```") || searchResult.snippet.contains("function") || searchResult.snippet.contains("class")
        self.hasErrors = searchResult.hasErrors
    }
    
    /// Initialize from MCP conversation data
    init(from dict: [String: Any]) throws {
        guard let title = dict["title"] as? String,
              let project = dict["project"] as? String,
              let messageCount = dict["message_count"] as? Int else {
            throw MCPClientError.invalidResponse
        }
        
        self.title = title
        self.project = project
        self.messageCount = messageCount
        self.hasErrors = dict["has_errors"] as? Bool ?? false
        self.hasCode = dict["has_code"] as? Bool ?? false
        
        // Parse date
        if let dateString = dict["date"] as? String,
           let date = ISO8601DateFormatter().date(from: dateString) {
            self.date = date
        } else {
            self.date = Date()
        }
    }
    
    /// Sample mock conversations for testing
    static var mockData: [ConversationItem] {
        [
            ConversationItem(
                title: "Implementing authentication system",
                project: "devmind",
                date: Date().addingTimeInterval(-3600),
                messageCount: 45,
                hasCode: true,
                hasErrors: false
            ),
            ConversationItem(
                title: "Debugging MCP server connection",
                project: "ai-memory",
                date: Date().addingTimeInterval(-7200),
                messageCount: 23,
                hasCode: true,
                hasErrors: true
            ),
            ConversationItem(
                title: "Refactoring database schema",
                project: "shadowgit-mcp",
                date: Date().addingTimeInterval(-10800),
                messageCount: 67,
                hasCode: true,
                hasErrors: false
            ),
            ConversationItem(
                title: "UI design discussion",
                project: "ketchup",
                date: Date().addingTimeInterval(-86400),
                messageCount: 12,
                hasCode: false,
                hasErrors: false
            ),
            ConversationItem(
                title: "Performance optimization",
                project: "devmind",
                date: Date().addingTimeInterval(-172800),
                messageCount: 89,
                hasCode: true,
                hasErrors: false
            )
        ]
    }
}

/// Mock project data for sidebar navigation
struct ProjectItem: Identifiable {
    let id = UUID()
    let name: String
    let path: String
    let conversationCount: Int
    let lastActive: Date
    
    /// Sample mock projects for testing
    static var mockData: [ProjectItem] {
        [
            ProjectItem(
                name: "devmind",
                path: "~/Documents/Github/devmind",
                conversationCount: 127,
                lastActive: Date()
            ),
            ProjectItem(
                name: "ai-memory",
                path: "~/Documents/Github/ai-memory",
                conversationCount: 45,
                lastActive: Date().addingTimeInterval(-3600)
            ),
            ProjectItem(
                name: "shadowgit-mcp",
                path: "~/Documents/Github/shadowgit-mcp",
                conversationCount: 89,
                lastActive: Date().addingTimeInterval(-7200)
            ),
            ProjectItem(
                name: "ketchup",
                path: "~/Documents/Github/ketchup",
                conversationCount: 234,
                lastActive: Date().addingTimeInterval(-86400)
            )
        ]
    }
}

/// Mock restore point data for git integration
struct RestorePoint: Identifiable, Hashable {
    let id = UUID()
    let restorePointId: Int  // MCP server ID
    let label: String
    let commit: String
    let date: Date
    let author: String
    let message: String
    let description: String?  // Optional description
    let filesChanged: Int
    let insertions: Int
    let deletions: Int
    let testStatus: TestStatus
    
    /// Traditional initializer for mock data
    init(label: String, commit: String, date: Date, author: String, message: String, filesChanged: Int, insertions: Int, deletions: Int, testStatus: TestStatus) {
        self.label = label
        self.commit = commit
        self.date = date
        self.author = author
        self.message = message
        self.filesChanged = filesChanged
        self.insertions = insertions
        self.deletions = deletions
        self.testStatus = testStatus
    }
    
    /// Initialize from MCP data
    init(from dict: [String: Any]) throws {
        guard let label = dict["label"] as? String,
              let commit = dict["commit_hash"] as? String,
              let author = dict["author"] as? String,
              let message = dict["message"] as? String else {
            throw MCPClientError.invalidResponse
        }
        
        self.label = label
        self.commit = commit
        self.author = author
        self.message = message
        self.filesChanged = dict["files_changed"] as? Int ?? 0
        self.insertions = dict["insertions"] as? Int ?? 0
        self.deletions = dict["deletions"] as? Int ?? 0
        
        // Parse date
        if let dateString = dict["date"] as? String,
           let date = ISO8601DateFormatter().date(from: dateString) {
            self.date = date
        } else {
            self.date = Date()
        }
        
        // Parse test status
        if let statusString = dict["test_status"] as? String {
            switch statusString.lowercased() {
            case "passing":
                self.testStatus = .passing
            case "failing":
                self.testStatus = .failing
            default:
                self.testStatus = .unknown
            }
        } else {
            self.testStatus = .unknown
        }
    }
    
    enum TestStatus {
        case passing, failing, unknown
        
        var icon: String {
            switch self {
            case .passing: return "checkmark.circle.fill"
            case .failing: return "xmark.circle.fill"
            case .unknown: return "questionmark.circle"
            }
        }
        
        var color: Color {
            switch self {
            case .passing: return .green
            case .failing: return .red
            case .unknown: return .gray
            }
        }
    }
    
    /// Sample mock restore points for testing
    static var mockData: [RestorePoint] {
        [
            RestorePoint(
                label: "before-refactor",
                commit: "a1b2c3d",
                date: Date().addingTimeInterval(-3600),
                author: "You",
                message: "Save point before major refactoring",
                filesChanged: 12,
                insertions: 245,
                deletions: 189,
                testStatus: .passing
            ),
            RestorePoint(
                label: "stable-auth",
                commit: "e4f5g6h",
                date: Date().addingTimeInterval(-7200),
                author: "You",
                message: "Working authentication implementation",
                filesChanged: 8,
                insertions: 567,
                deletions: 23,
                testStatus: .passing
            ),
            RestorePoint(
                label: "pre-merge",
                commit: "i7j8k9l",
                date: Date().addingTimeInterval(-10800),
                author: "You",
                message: "State before merging feature branch",
                filesChanged: 23,
                insertions: 890,
                deletions: 456,
                testStatus: .unknown
            )
        ]
    }
}