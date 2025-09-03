//
//  RepositoryConfig.swift
//  CommitChat
//
//  Created on 2025-09-03.
//

import Foundation

/// Configuration model for auto-commit repository management
/// Represents a single repository's auto-commit settings and status
struct RepositoryConfig: Codable, Identifiable, Equatable {
    /// Unique identifier for the repository
    var id = UUID()
    
    /// Absolute path to the repository directory
    let path: String
    
    /// Display name for the repository (derived from path)
    var displayName: String {
        URL(fileURLWithPath: path).lastPathComponent
    }
    
    /// Whether auto-commit is enabled for this repository
    var isEnabled: Bool
    
    /// Whether this repository was auto-detected or manually added
    let isAutoDetected: Bool
    
    /// Notification preference for this repository
    var notificationPreference: NotificationPreference
    
    /// Throttle time in seconds between commits
    var throttleSeconds: Int
    
    /// Maximum file size in MB for auto-commit
    var maxFileSizeMB: Int
    
    /// File patterns to exclude from auto-commit
    var excludedPatterns: [String]
    
    /// Shadow branch prefix (usually "shadow/")
    var shadowBranchPrefix: String
    
    /// Statistics
    var totalCommits: Int
    var lastCommitDate: Date?
    
    /// Current status
    var connectionStatus: ConnectionStatus
    
    /// Initialize with default settings
    init(path: String, isAutoDetected: Bool = false) {
        self.path = path
        self.isEnabled = true
        self.isAutoDetected = isAutoDetected
        self.notificationPreference = .batched
        self.throttleSeconds = 2
        self.maxFileSizeMB = 10
        self.excludedPatterns = [
            "node_modules/**",
            "dist/**",
            "*.lock",
            ".env",
            ".env.*"
        ]
        self.shadowBranchPrefix = "shadow/"
        self.totalCommits = 0
        self.lastCommitDate = nil
        self.connectionStatus = .disconnected
    }
}

/// Notification preferences for auto-commit
enum NotificationPreference: String, CaseIterable, Codable {
    case disabled = "disabled"
    case everyCommit = "every_commit"
    case batched = "batched"
    case hourly = "hourly"
    
    var displayName: String {
        switch self {
        case .disabled: return "Disabled"
        case .everyCommit: return "Every Commit"
        case .batched: return "Batched (10 commits)"
        case .hourly: return "Hourly Summary"
        }
    }
}

/// Repository connection status
enum ConnectionStatus: String, Codable {
    case connected = "connected"
    case disconnected = "disconnected"
    case error = "error"
    case monitoring = "monitoring"
    
    var displayName: String {
        switch self {
        case .connected: return "Connected"
        case .disconnected: return "Disconnected"
        case .error: return "Error"
        case .monitoring: return "Monitoring"
        }
    }
    
    var color: String {
        switch self {
        case .connected, .monitoring: return "green"
        case .disconnected: return "gray"
        case .error: return "red"
        }
    }
}