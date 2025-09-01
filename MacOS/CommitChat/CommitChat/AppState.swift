//
//  AppState.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI
import Combine

/// Central state management for the CommitChat application.
/// Manages window visibility, MCP server connection status, and application settings.
class AppState: ObservableObject {
    // MARK: - Window Visibility
    
    /// Controls visibility of the search conversations window
    @Published var showSearchWindow = false
    
    /// Controls visibility of the main conversation browser window
    @Published var showMainBrowser = false
    
    /// Controls visibility of the restore points window
    @Published var showRestorePoints = false
    
    /// Controls visibility of the settings window
    @Published var showSettings = false
    
    // MARK: - MCP Server Status
    
    /// Indicates whether the app is connected to the MCP server
    @Published var isConnected = false
    
    /// Timestamp of the last successful sync with the MCP server
    @Published var lastSyncTime: Date?
    
    /// Total number of indexed conversations
    @Published var conversationCount = 0
    
    /// Total number of available restore points
    @Published var restorePointCount = 0
    
    // MARK: - Search State
    
    /// Current search query text
    @Published var searchQuery = ""
    
    /// Array of conversation search results
    @Published var searchResults: [ConversationItem] = []
    
    /// Indicates if a search operation is in progress
    @Published var isSearching = false
    
    // MARK: - Settings
    
    /// Path to the MCP server installation
    @Published var mcpServerPath = "~/.claude/ai-memory"
    
    /// Whether to automatically start the MCP server on app launch
    @Published var autoStartServer = true
    
    /// Whether to show system notifications
    @Published var showNotifications = true
    
    // MARK: - Initialization
    
    init() {
        // Initialize state
        setupInitialState()
    }
    
    /// Sets up initial application state with mock data (Phase 2)
    /// - Note: In Phase 3, this will connect to the actual MCP server
    private func setupInitialState() {
        // TODO: In Phase 3, this will connect to MCP server
        // For now, use mock data
        isConnected = true
        conversationCount = 550
        restorePointCount = 12
        lastSyncTime = Date()
    }
    
    // MARK: - Window Management
    
    /// Opens the search conversations window
    func openSearchWindow() {
        showSearchWindow = true
    }
    
    /// Opens the main conversation browser window
    func openMainBrowser() {
        showMainBrowser = true
    }
    
    /// Opens the restore points window
    func openRestorePoints() {
        showRestorePoints = true
    }
    
    /// Opens the settings window
    func openSettings() {
        showSettings = true
    }
    
    /// Closes all application windows
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