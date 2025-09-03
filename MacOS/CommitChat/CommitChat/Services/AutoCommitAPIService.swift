//
//  AutoCommitAPIService.swift
//  CommitChat
//
//  Created on 2025-09-03.
//

import Foundation
import os
import Combine

/// Service for communicating with the Node.js auto-commit service
/// Uses process execution to interact with the CLI interface
class AutoCommitAPIService: ObservableObject {
    
    static let shared = AutoCommitAPIService()
    private let logger = Logger(subsystem: "com.CommitChat", category: "AutoCommitAPI")
    
    /// Connection status with the Node.js service
    @Published var isConnected = false
    
    /// Last error from the service
    @Published var lastError: String?
    
    /// Commit statistics from the service
    @Published var commitStats: CommitStatistics = CommitStatistics()
    
    private init() {}
    
    // MARK: - Service Communication
    
    /// Checks if the Node.js auto-commit service is running
    func checkServiceStatus() async -> Bool {
        let result = await executeCommand(["status"])
        
        await MainActor.run {
            isConnected = result.success
            if !result.success {
                lastError = result.error
            }
        }
        
        return result.success
    }
    
    /// Starts the auto-commit service
    func startService() async -> Bool {
        let result = await executeCommand(["start"])
        
        await MainActor.run {
            if result.success {
                isConnected = true
                lastError = nil
            } else {
                isConnected = false
                lastError = result.error
            }
        }
        
        return result.success
    }
    
    /// Stops the auto-commit service
    func stopService() async -> Bool {
        let result = await executeCommand(["stop"])
        
        await MainActor.run {
            if result.success {
                isConnected = false
                lastError = nil
            } else {
                lastError = result.error
            }
        }
        
        return result.success
    }
    
    // MARK: - Repository Management
    
    /// Adds a repository to monitoring
    func addRepository(_ repository: RepositoryConfig) async -> Bool {
        let throttleArg = "--throttle"
        let throttleValue = String(repository.throttleSeconds * 1000) // Convert to milliseconds
        
        let result = await executeCommand([
            "add", 
            repository.path,
            throttleArg, 
            throttleValue
        ])
        
        if !result.success {
            await MainActor.run {
                lastError = result.error
            }
        }
        
        return result.success
    }
    
    /// Removes a repository from monitoring
    func removeRepository(_ repository: RepositoryConfig) async -> Bool {
        let result = await executeCommand(["remove", repository.path])
        
        if !result.success {
            await MainActor.run {
                lastError = result.error
            }
        }
        
        return result.success
    }
    
    /// Updates repository configuration
    func updateRepositoryConfig(_ repository: RepositoryConfig) async -> Bool {
        // For now, we remove and re-add with new configuration
        let removeSuccess = await removeRepository(repository)
        if removeSuccess {
            return await addRepository(repository)
        }
        return false
    }
    
    /// Gets list of monitored repositories from the service
    func getMonitoredRepositories() async -> [RepositoryInfo] {
        let result = await executeCommand(["list"])
        
        if result.success {
            return parseRepositoryList(result.output)
        } else {
            await MainActor.run {
                lastError = result.error
            }
            return []
        }
    }
    
    // MARK: - Statistics
    
    /// Updates commit statistics from the service
    func updateCommitStatistics() async {
        let result = await executeCommand(["status"])
        
        if result.success {
            let stats = parseCommitStatistics(result.output)
            await MainActor.run {
                commitStats = stats
                isConnected = true // Service responded successfully
            }
        } else {
            await MainActor.run {
                lastError = result.error
                isConnected = false
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func executeCommand(_ arguments: [String]) async -> ProcessResult {
        let logger = self.logger
        return await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .background).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/usr/bin/node")
                
                // Path to the CLI script - resolve dynamically
                let cliPath = self.findCLIScript()
                process.arguments = [cliPath] + arguments
                
                let outputPipe = Pipe()
                let errorPipe = Pipe()
                process.standardOutput = outputPipe
                process.standardError = errorPipe
                
                do {
                    try process.run()
                    process.waitUntilExit()
                    
                    let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
                    let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
                    
                    let output = String(data: outputData, encoding: .utf8) ?? ""
                    let error = String(data: errorData, encoding: .utf8) ?? ""
                    
                    let result = ProcessResult(
                        success: process.terminationStatus == 0,
                        output: output,
                        error: error.isEmpty ? nil : error
                    )
                    
                    logger.debug("Command executed: \(arguments.joined(separator: " ")) - Success: \(result.success)")
                    
                    continuation.resume(returning: result)
                } catch {
                    logger.error("Failed to execute command: \(arguments.joined(separator: " ")) - Error: \(error.localizedDescription)")
                    
                    let result = ProcessResult(
                        success: false,
                        output: "",
                        error: error.localizedDescription
                    )
                    continuation.resume(returning: result)
                }
            }
        }
    }
    
    /// Find the CLI script dynamically instead of using hardcoded path
    private func findCLIScript() -> String {
        // Try common development locations
        let possiblePaths = [
            "~/Documents/Github/devmind/src/shadow-commit/cli.js",
            "../../../src/shadow-commit/cli.js",
            "./src/shadow-commit/cli.js",
            "/usr/local/share/devmind/cli.js"
        ]
        
        for path in possiblePaths {
            let expandedPath = NSString(string: path).expandingTildeInPath
            if FileManager.default.fileExists(atPath: expandedPath) {
                return expandedPath
            }
        }
        
        // Fallback to bundled resource if available
        if let bundlePath = Bundle.main.path(forResource: "cli", ofType: "js") {
            return bundlePath
        }
        
        // Final fallback - assume development environment
        return NSString(string: "~/Documents/Github/devmind/src/shadow-commit/cli.js").expandingTildeInPath
    }
    
    /// Start monitoring for notifications from the Node.js service
    func startNotificationMonitoring() {
        let notificationFile = NSString(string: "~/.devmind-notifications.json").expandingTildeInPath
        
        // Create file watcher for notification file
        let fileURL = URL(fileURLWithPath: notificationFile)
        
        // Start polling for notification file changes (simple approach)
        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.checkForNewNotifications()
        }
    }
    
    /// Check for new notifications from Node.js service
    private func checkForNewNotifications() {
        let notificationFile = NSString(string: "~/.devmind-notifications.json").expandingTildeInPath
        
        guard FileManager.default.fileExists(atPath: notificationFile) else { return }
        
        do {
            let data = try Data(contentsOf: URL(fileURLWithPath: notificationFile))
            let notifications = try JSONDecoder().decode([NotificationData].self, from: data)
            
            // Process only new notifications (simple timestamp check)
            for notification in notifications {
                if shouldProcessNotification(notification) {
                    Task { @MainActor in
                        await self.processAutoCommitNotification(notification)
                    }
                }
            }
            
        } catch {
            logger.error("Failed to read notification file: \(error)")
        }
    }
    
    /// Process an auto-commit notification
    @MainActor
    private func processAutoCommitNotification(_ notification: NotificationData) async {
        // Send notification through AppState
        await AppState.shared.sendAutoCommitNotification(
            repositoryPath: notification.repository,
            fileName: URL(fileURLWithPath: notification.file).lastPathComponent,
            commitHash: notification.commitHash,
            branch: notification.branch
        )
    }
    
    /// Check if notification should be processed (avoid duplicates)
    private func shouldProcessNotification(_ notification: NotificationData) -> Bool {
        // Simple time-based check - only process notifications from last 30 seconds
        let formatter = ISO8601DateFormatter()
        guard let notificationTime = formatter.date(from: notification.timestamp) else { return false }
        return Date().timeIntervalSince(notificationTime) < 30
    }
    
    private func parseRepositoryList(_ output: String) -> [RepositoryInfo] {
        // Parse the CLI output to extract repository information
        // This will depend on the actual output format from the CLI
        var repositories: [RepositoryInfo] = []
        
        let lines = output.components(separatedBy: .newlines)
        for line in lines {
            if line.contains("Monitoring:") {
                // Extract repository path and status
                // Format example: "✓ /path/to/repo (enabled)"
                if let path = extractPath(from: line) {
                    let info = RepositoryInfo(
                        path: path,
                        enabled: line.contains("✓"),
                        monitoring: true
                    )
                    repositories.append(info)
                }
            }
        }
        
        return repositories
    }
    
    private func parseCommitStatistics(_ output: String) -> CommitStatistics {
        // Parse statistics output from CLI status command
        var totalCommits = 0
        var repositoryCount = 0
        
        let lines = output.components(separatedBy: .newlines)
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.contains("Total Commits:") {
                totalCommits = extractNumber(from: trimmed) ?? 0
            } else if trimmed.contains("Active Repositories:") {
                repositoryCount = extractNumber(from: trimmed) ?? 0
            }
        }
        
        return CommitStatistics(
            totalCommits: totalCommits,
            repositoryCount: repositoryCount
        )
    }
    
    private func extractPath(from line: String) -> String? {
        // Extract file path from output line
        let components = line.components(separatedBy: " ")
        return components.first { $0.hasPrefix("/") }
    }
    
    private func extractNumber(from line: String) -> Int? {
        let pattern = #"\d+"#
        let regex = try? NSRegularExpression(pattern: pattern)
        let range = NSRange(location: 0, length: line.utf16.count)
        
        if let match = regex?.firstMatch(in: line, range: range) {
            let numberString = String(line[Range(match.range, in: line)!])
            return Int(numberString)
        }
        
        return nil
    }
}

// MARK: - Supporting Data Models

struct ProcessResult {
    let success: Bool
    let output: String
    let error: String?
}

struct RepositoryInfo {
    let path: String
    let enabled: Bool
    let monitoring: Bool
}

struct CommitStatistics {
    let totalCommits: Int
    let repositoryCount: Int
    
    init(totalCommits: Int = 0, repositoryCount: Int = 0) {
        self.totalCommits = totalCommits
        self.repositoryCount = repositoryCount
    }
}

struct NotificationData: Codable {
    let timestamp: String
    let type: String
    let repository: String
    let file: String
    let branch: String
    let commitHash: String
    let sessionId: String?
}