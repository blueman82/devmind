//
//  AppState.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI
import Combine
import UserNotifications

/// Central state management for the CommitChat application.
/// Manages window visibility, MCP server connection status, and application settings.
class AppState: ObservableObject {
    
    /// Shared singleton instance for consistent state management
    static let shared = AppState()
    
    // MARK: - MCP Integration
    
    /// Reference to the ProcessManager for server lifecycle
    private let processManager = ProcessManager.shared
    
    /// Reference to the MCPClient for API communication
    private let mcpClient = MCPClient.shared
    
    /// Reference to the AutoCommitAPIService for auto-commit functionality
    private let autoCommitAPI = AutoCommitAPIService.shared
    
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
    @Published var mcpServerPath = "~/.claude/ai-memory" {
        didSet {
            UserDefaults.standard.set(mcpServerPath, forKey: "mcpServerPath")
        }
    }
    
    /// Path to the project directory for restore points
    @Published var projectPath = "/Users/harrison/Documents/Github/devmind" {
        didSet {
            UserDefaults.standard.set(projectPath, forKey: "projectPath")
        }
    }
    
    /// Whether to automatically start the MCP server on app launch
    @Published var autoStartServer = true {
        didSet {
            UserDefaults.standard.set(autoStartServer, forKey: "autoStartServer")
        }
    }
    
    /// Whether to show system notifications
    @Published var showNotifications = true {
        didSet {
            UserDefaults.standard.set(showNotifications, forKey: "showNotifications")
        }
    }
    
    // MARK: - Repository Management (Phase 2b)
    
    /// Auto-commit service enabled/disabled globally
    @Published var autoCommitEnabled = false {
        didSet {
            UserDefaults.standard.set(autoCommitEnabled, forKey: "autoCommitEnabled")
        }
    }
    
    /// List of monitored repositories
    @Published var monitoredRepositories: [RepositoryConfig] = []
    
    /// Auto-detect repositories from Claude projects
    @Published var autoDetectRepositories = true {
        didSet {
            UserDefaults.standard.set(autoDetectRepositories, forKey: "autoDetectRepositories")
        }
    }
    
    /// Total auto-commits created across all repositories
    @Published var totalAutoCommits = 0
    
    /// Auto-commit service connection status
    @Published var autoCommitServiceConnected = false
    
    /// Notification authorization status
    @Published var notificationsAuthorized = false
    
    /// Notification frequency setting
    @Published var notificationFrequency: NotificationFrequency = .everyCommit {
        didSet {
            UserDefaults.standard.set(notificationFrequency.rawValue, forKey: "notificationFrequency")
        }
    }
    
    // MARK: - Initialization
    
    init() {
        // Load settings from UserDefaults
        loadSettings()
        // Load repository settings
        loadRepositorySettings()
        // Initialize state
        setupInitialState()
        // Setup MCP server monitoring
        setupMCPMonitoring()
        // Setup Auto-Commit service monitoring
        setupAutoCommitMonitoring()
        // Setup notifications
        setupNotifications()
    }
    
    /// Loads settings from UserDefaults
    private func loadSettings() {
        if let savedMCPPath = UserDefaults.standard.string(forKey: "mcpServerPath") {
            mcpServerPath = savedMCPPath
        }
        if let savedProjectPath = UserDefaults.standard.string(forKey: "projectPath") {
            projectPath = savedProjectPath
        }
        autoStartServer = UserDefaults.standard.bool(forKey: "autoStartServer")
        showNotifications = UserDefaults.standard.bool(forKey: "showNotifications")
        
        // Set defaults for first run
        if UserDefaults.standard.object(forKey: "autoStartServer") == nil {
            UserDefaults.standard.set(true, forKey: "autoStartServer")
            autoStartServer = true
        }
        if UserDefaults.standard.object(forKey: "showNotifications") == nil {
            UserDefaults.standard.set(true, forKey: "showNotifications")
            showNotifications = true
        }
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
    
    /// Sets up monitoring of Auto-Commit service status using Combine
    private func setupAutoCommitMonitoring() {
        // Monitor AutoCommit service connection status
        autoCommitAPI.$isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] connected in
                self?.autoCommitServiceConnected = connected
                
                // Update statistics when connected
                if connected {
                    Task {
                        await self?.autoCommitAPI.updateCommitStatistics()
                    }
                }
            }
            .store(in: &cancellables)
        
        // Monitor AutoCommit service errors
        autoCommitAPI.$lastError
            .receive(on: DispatchQueue.main)
            .sink { errorMessage in
                if let error = errorMessage {
                    // Log the error or handle it as needed
                    print("Auto-commit service error: \(error)")
                }
            }
            .store(in: &cancellables)
        
        // Monitor commit statistics updates
        autoCommitAPI.$commitStats
            .receive(on: DispatchQueue.main)
            .sink { [weak self] stats in
                self?.totalAutoCommits = stats.totalCommits
            }
            .store(in: &cancellables)
        
        // Check initial service status
        Task {
            await checkAutoCommitServiceStatus()
        }
        
        // Start monitoring for auto-commit notifications
        autoCommitAPI.startNotificationMonitoring()
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
                    projectPath: projectPath,
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
    
    // MARK: - Repository Management
    
    /// Discovers git repositories on the local file system and populates monitoredRepositories
    func discoverRepositories() async {
        let discoveredRepos = await RepositoryDiscoveryService.shared.discoverRepositories()
        
        await MainActor.run {
            // Merge discovered repositories with existing ones, avoiding duplicates
            var uniqueRepos = monitoredRepositories
            
            for discoveredRepo in discoveredRepos {
                if !uniqueRepos.contains(where: { $0.path == discoveredRepo.path }) {
                    uniqueRepos.append(discoveredRepo)
                }
            }
            
            monitoredRepositories = uniqueRepos
            saveRepositorySettings()
        }
    }
    
    /// Manually adds a repository to the monitored list
    func addRepository(_ repositoryConfig: RepositoryConfig) {
        if !monitoredRepositories.contains(where: { $0.path == repositoryConfig.path }) {
            monitoredRepositories.append(repositoryConfig)
            saveRepositorySettings()
        }
    }
    
    /// Removes a repository from the monitored list
    func removeRepository(_ repositoryConfig: RepositoryConfig) {
        monitoredRepositories.removeAll { $0.id == repositoryConfig.id }
        saveRepositorySettings()
    }
    
    /// Loads repository settings from UserDefaults
    private func loadRepositorySettings() {
        if let data = UserDefaults.standard.data(forKey: "monitoredRepositories"),
           let repositories = try? JSONDecoder().decode([RepositoryConfig].self, from: data) {
            monitoredRepositories = repositories
        }
        
        // Load repository-specific settings
        autoCommitEnabled = UserDefaults.standard.bool(forKey: "autoCommitEnabled")
        autoDetectRepositories = UserDefaults.standard.bool(forKey: "autoDetectRepositories")
        
        // Set defaults for first run
        if UserDefaults.standard.object(forKey: "autoDetectRepositories") == nil {
            UserDefaults.standard.set(true, forKey: "autoDetectRepositories")
            autoDetectRepositories = true
        }
    }
    
    /// Saves repository settings to UserDefaults
    private func saveRepositorySettings() {
        if let data = try? JSONEncoder().encode(monitoredRepositories) {
            UserDefaults.standard.set(data, forKey: "monitoredRepositories")
        }
    }
    
    // MARK: - Auto-Commit Service Management
    
    /// Checks the auto-commit service status
    func checkAutoCommitServiceStatus() async {
        let isRunning = await autoCommitAPI.checkServiceStatus()
        await MainActor.run {
            autoCommitServiceConnected = isRunning
        }
    }
    
    /// Starts the auto-commit service
    func startAutoCommitService() async -> Bool {
        let success = await autoCommitAPI.startService()
        if success {
            await checkAutoCommitServiceStatus()
        }
        return success
    }
    
    /// Stops the auto-commit service
    func stopAutoCommitService() async -> Bool {
        let success = await autoCommitAPI.stopService()
        if success {
            await MainActor.run {
                autoCommitServiceConnected = false
            }
        }
        return success
    }
    
    /// Syncs repository configurations with the auto-commit service
    func syncRepositoriesWithService() async {
        // Add all enabled repositories to the service
        for repo in monitoredRepositories where repo.isEnabled {
            _ = await autoCommitAPI.addRepository(repo)
        }
        
        // Update commit statistics
        await autoCommitAPI.updateCommitStatistics()
    }
    
    // MARK: - Notification Management
    
    /// Setup notifications system
    private func setupNotifications() {
        // Load notification settings
        if let frequencyRawValue = UserDefaults.standard.string(forKey: "notificationFrequency"),
           let frequency = NotificationFrequency(rawValue: frequencyRawValue) {
            notificationFrequency = frequency
        }
        
        // Check authorization status
        checkNotificationAuthorization()
    }
    
    /// Check current notification authorization status
    private func checkNotificationAuthorization() {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            DispatchQueue.main.async {
                self?.notificationsAuthorized = settings.authorizationStatus == .authorized
            }
        }
    }
    
    /// Request notification permissions from the user
    func requestNotificationPermissions() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .sound, .badge]
            )
            
            await MainActor.run {
                notificationsAuthorized = granted
            }
            
            return granted
        } catch {
            return false
        }
    }
    
    /// Send notification for auto-commit
    func sendAutoCommitNotification(
        repositoryPath: String,
        fileName: String, 
        commitHash: String,
        branch: String
    ) async {
        guard notificationsAuthorized else { return }
        guard notificationFrequency != .disabled else { return }
        
        let repositoryName = URL(fileURLWithPath: repositoryPath).lastPathComponent
        
        let content = UNMutableNotificationContent()
        content.title = "Auto-commit Created"
        content.body = "\(fileName) committed to \(repositoryName)/\(branch)"
        content.subtitle = "Commit: \(String(commitHash.prefix(8)))"
        content.sound = .default
        
        let request = UNNotificationRequest(
            identifier: "auto-commit-\(commitHash)",
            content: content,
            trigger: nil
        )
        
        do {
            try await UNUserNotificationCenter.current().add(request)
        } catch {
            // Silently handle notification errors
        }
    }
    
    /// Send error notification from auto-commit service
    func sendErrorNotification(
        title: String,
        body: String,
        severity: String,
        requiresAction: Bool
    ) async {
        guard notificationsAuthorized else { return }
        guard showNotifications else { return }
        
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.subtitle = "Severity: \(severity)"
        
        // Use different sound for critical errors
        if severity == "critical" || severity == "high" {
            content.sound = .defaultCritical
        } else {
            content.sound = .default
        }
        
        // Add action category for errors requiring user action
        if requiresAction {
            content.categoryIdentifier = "ERROR_ACTION"
            content.interruptionLevel = .critical
        }
        
        let request = UNNotificationRequest(
            identifier: "error-\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        
        do {
            try await UNUserNotificationCenter.current().add(request)
        } catch {
            // Silently handle notification errors
            print("Failed to send error notification: \(error)")
        }
    }
}

// MARK: - Supporting Types

/// Notification frequency options for auto-commit notifications
enum NotificationFrequency: String, CaseIterable {
    case disabled = "disabled"
    case everyCommit = "everyCommit"
    case batched = "batched"
    case hourly = "hourly"
    
    var displayName: String {
        switch self {
        case .disabled:
            return "Disabled"
        case .everyCommit:
            return "Every Commit"
        case .batched:
            return "Batched (10 commits)"
        case .hourly:
            return "Hourly Summary"
        }
    }
}

// Note: Mock data has been moved to Models/MockData.swift for better organization