//
//  MockData.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import Foundation

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
    let label: String
    let commit: String
    let date: Date
    let author: String
    let message: String
    let filesChanged: Int
    let insertions: Int
    let deletions: Int
    let testStatus: TestStatus
    
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