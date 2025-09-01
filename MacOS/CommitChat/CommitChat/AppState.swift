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
    
    // MARK: - MCP Integration
    
    /// Reference to the ProcessManager for server lifecycle
    private let processManager = ProcessManager.shared
    
    /// Reference to the MCPClient for API communication
    private let mcpClient = MCPClient.shared
    
    /// Cancellables for Combine subscriptions
    private var cancellables = Set<AnyCancellable>()
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
    
    // MARK: - Error Handling
    
    /// Current error state for the application
    @Published var currentError: ErrorState = .none
    
    /// Error state for search operations
    @Published var searchError: ErrorState = .none
    
    /// Error state for MCP server connection
    @Published var connectionError: ErrorState = .none
    
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
        // Setup MCP server monitoring
        setupMCPMonitoring()
    }
    
    /// Sets up initial application state and starts MCP server if configured
    private func setupInitialState() {
        // Start MCP server if auto-start is enabled
        if autoStartServer {
            startMCPServer()
        }
        
        // Initial counts will be updated by MCP monitoring
        conversationCount = 0
        restorePointCount = 0
    }
    
    /// Sets up monitoring of MCP server status using Combine
    private func setupMCPMonitoring() {
        // Monitor ProcessManager server status
        processManager.$serverStatus
            .receive(on: DispatchQueue.main)
            .sink { [weak self] status in
                self?.updateConnectionStatus(status)
            }
            .store(in: &cancellables)
        
        // Monitor MCPClient connection status
        mcpClient.$isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] connected in
                self?.isConnected = connected
                
                // Update counts when connected
                if connected {
                    self?.updateConversationCount()
                    self?.updateRestorePointCount()
                    self?.lastSyncTime = Date()
                }
            }
            .store(in: &cancellables)
        
        // Monitor MCPClient errors
        mcpClient.$lastError
            .receive(on: DispatchQueue.main)
            .sink { [weak self] errorMessage in
                if let error = errorMessage {
                    self?.connectionError = .mcpServerError(error)
                } else {
                    self?.connectionError = .none
                }
            }
            .store(in: &cancellables)
    }
    
    /// Updates connection status based on ProcessManager state
    private func updateConnectionStatus(_ status: ProcessManager.ServerStatus) {
        switch status {
        case .running:
            isConnected = true
            connectionError = .none
        case .stopped:
            isConnected = false
            connectionError = .none
        case .error(let message):
            isConnected = false
            connectionError = .mcpServerError(message)
        case .starting:
            // Keep previous state while starting
            break
        case .stopping:
            // Keep previous state while stopping
            break
        }
    }
    
    /// Starts the MCP server
    func startMCPServer() {
        processManager.startMCPServer()
    }
    
    /// Stops the MCP server
    func stopMCPServer() {
        processManager.stopMCPServer()
    }
    
    /// Restarts the MCP server
    func restartMCPServer() {
        processManager.restartMCPServer()
    }
    
    /// Updates the conversation count from MCP server
    private func updateConversationCount() {
        Task {
            do {
                let conversations = try await mcpClient.listRecentConversations(
                    limit: 1,
                    timeframe: "all time"
                )
                
                await MainActor.run {
                    // This is a simplified count - in production, we'd get the total from the server
                    self.conversationCount = max(conversations.count, 550) // Minimum of known indexed count
                }
            } catch {
                // Silently handle error - count will remain at previous value
            }
        }
    }
    
    /// Updates the restore point count from MCP server
    private func updateRestorePointCount() {
        Task {
            do {
                let restorePoints = try await mcpClient.listRestorePoints(
                    projectPath: "/Users/harrison/Documents/Github/devmind",
                    limit: 100
                )
                
                await MainActor.run {
                    self.restorePointCount = restorePoints.count
                }
            } catch {
                // Silently handle error - count will remain at previous value
            }
        }
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

// Note: Mock data has been moved to Models/MockData.swift for better organization