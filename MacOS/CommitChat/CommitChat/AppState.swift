//
//  AppState.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI
import Combine

class AppState: ObservableObject {
    // Window visibility states
    @Published var showSearchWindow = false
    @Published var showMainBrowser = false
    @Published var showRestorePoints = false
    @Published var showSettings = false
    
    // Menu bar status
    @Published var isConnected = false
    @Published var lastSyncTime: Date?
    @Published var conversationCount = 0
    @Published var restorePointCount = 0
    
    // Search state
    @Published var searchQuery = ""
    @Published var searchResults: [ConversationItem] = []
    @Published var isSearching = false
    
    // Settings
    @Published var mcpServerPath = "~/.claude/ai-memory"
    @Published var autoStartServer = true
    @Published var showNotifications = true
    
    // Singleton instance
    static let shared = AppState()
    
    private init() {
        // Initialize state
        setupInitialState()
    }
    
    private func setupInitialState() {
        // TODO: In Phase 3, this will connect to MCP server
        // For now, use mock data
        isConnected = true
        conversationCount = 550
        restorePointCount = 12
        lastSyncTime = Date()
    }
    
    // Window management functions
    func openSearchWindow() {
        showSearchWindow = true
    }
    
    func openMainBrowser() {
        showMainBrowser = true
    }
    
    func openRestorePoints() {
        showRestorePoints = true
    }
    
    func openSettings() {
        showSettings = true
    }
    
    func closeAllWindows() {
        showSearchWindow = false
        showMainBrowser = false
        showRestorePoints = false
        showSettings = false
    }
}

// Mock data structure for Phase 2
struct ConversationItem: Identifiable {
    let id = UUID()
    let title: String
    let project: String
    let date: Date
    let messageCount: Int
    let hasCode: Bool
    let hasErrors: Bool
    
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
                title: "Debugging database connection",
                project: "api-server",
                date: Date().addingTimeInterval(-7200),
                messageCount: 23,
                hasCode: true,
                hasErrors: true
            ),
            ConversationItem(
                title: "Refactoring Swift UI components",
                project: "CommitChat",
                date: Date().addingTimeInterval(-10800),
                messageCount: 67,
                hasCode: true,
                hasErrors: false
            )
        ]
    }
}