//
//  RepositoryDiscoveryService.swift
//  CommitChat
//
//  Created on 2025-09-03.
//

import Foundation
import os

/// Service responsible for discovering git repositories on the local file system
/// Scans common developer directories and validates git repository status
class RepositoryDiscoveryService: ObservableObject {
    
    static let shared = RepositoryDiscoveryService()
    private let logger = Logger(subsystem: "com.CommitChat", category: "RepositoryDiscovery")
    
    private init() {}
    
    /// Common directories where developers typically store git repositories
    private var commonGitDirectories: [String] {
        let homeDirectory = FileManager.default.homeDirectoryForCurrentUser.path
        return [
            "\(homeDirectory)/Documents/Github",
            "\(homeDirectory)/Documents/GitHub", // Case variation
            "\(homeDirectory)/Documents/Projects",
            "\(homeDirectory)/Projects",
            "\(homeDirectory)/Code",
            "\(homeDirectory)/Development",
            "\(homeDirectory)/Dev",
            "\(homeDirectory)/Workspace",
            "\(homeDirectory)/git",
            "\(homeDirectory)/repos",
            "\(homeDirectory)/repositories",
            "/Users/Shared/Development"
        ]
    }
    
    /// Discovers git repositories by scanning common developer directories
    /// - Returns: Array of RepositoryConfig objects for discovered repositories
    func discoverRepositories() async -> [RepositoryConfig] {
        logger.info("Starting repository discovery scan...")
        
        var discoveredRepos: [RepositoryConfig] = []
        
        // Scan each common directory
        for directory in commonGitDirectories {
            let repos = await scanDirectory(directory)
            discoveredRepos.append(contentsOf: repos)
        }
        
        // Remove duplicates based on path
        let uniqueRepos = Array(Set(discoveredRepos))
        
        logger.info("Repository discovery completed. Found \(uniqueRepos.count) repositories.")
        return uniqueRepos
    }
    
    /// Scans a specific directory for git repositories
    /// - Parameter directory: The directory path to scan
    /// - Returns: Array of RepositoryConfig objects found in the directory
    private func scanDirectory(_ directory: String) async -> [RepositoryConfig] {
        let expandedPath = NSString(string: directory).expandingTildeInPath
        
        guard FileManager.default.fileExists(atPath: expandedPath) else {
            logger.debug("Directory does not exist: \(expandedPath)")
            return []
        }
        
        var repositories: [RepositoryConfig] = []
        
        do {
            let contents = try FileManager.default.contentsOfDirectory(atPath: expandedPath)
            
            for item in contents {
                let itemPath = "\(expandedPath)/\(item)"
                
                // Skip hidden directories (except .git itself for nested scanning)
                guard !item.hasPrefix(".") || item == ".git" else { continue }
                
                // Check if this directory is a git repository
                if await isGitRepository(at: itemPath) {
                    let repoConfig = RepositoryConfig(path: itemPath, isAutoDetected: true)
                    repositories.append(repoConfig)
                    logger.debug("Discovered git repository: \(itemPath)")
                }
                
                // Recursively scan subdirectories (one level deep to avoid excessive scanning)
                else if isDirectory(at: itemPath) && !item.hasPrefix(".") {
                    let subRepos = await scanSubdirectories(in: itemPath, maxDepth: 2)
                    repositories.append(contentsOf: subRepos)
                }
            }
        } catch {
            logger.error("Error scanning directory \(expandedPath): \(error.localizedDescription)")
        }
        
        return repositories
    }
    
    /// Recursively scans subdirectories for git repositories
    /// - Parameters:
    ///   - directory: Directory to scan
    ///   - maxDepth: Maximum depth to recurse (prevents infinite loops)
    /// - Returns: Array of discovered repositories
    private func scanSubdirectories(in directory: String, maxDepth: Int) async -> [RepositoryConfig] {
        guard maxDepth > 0 else { return [] }
        
        var repositories: [RepositoryConfig] = []
        
        do {
            let contents = try FileManager.default.contentsOfDirectory(atPath: directory)
            
            for item in contents {
                let itemPath = "\(directory)/\(item)"
                
                // Skip hidden directories
                guard !item.hasPrefix(".") else { continue }
                
                if await isGitRepository(at: itemPath) {
                    let repoConfig = RepositoryConfig(path: itemPath, isAutoDetected: true)
                    repositories.append(repoConfig)
                    logger.debug("Discovered git repository: \(itemPath)")
                } else if isDirectory(at: itemPath) {
                    // Recurse with reduced depth
                    let subRepos = await scanSubdirectories(in: itemPath, maxDepth: maxDepth - 1)
                    repositories.append(contentsOf: subRepos)
                }
            }
        } catch {
            logger.debug("Error scanning subdirectory \(directory): \(error.localizedDescription)")
        }
        
        return repositories
    }
    
    /// Validates if a directory is a git repository
    /// - Parameter path: Path to check
    /// - Returns: True if the directory contains a valid git repository
    private func isGitRepository(at path: String) async -> Bool {
        let gitDir = "\(path)/.git"
        
        // Check if .git directory exists
        guard FileManager.default.fileExists(atPath: gitDir) else {
            return false
        }
        
        // Validate it's a proper git repository by checking git status
        return await validateGitRepository(at: path)
    }
    
    /// Validates git repository by running git status command
    /// - Parameter path: Repository path to validate
    /// - Returns: True if git status succeeds
    private func validateGitRepository(at path: String) async -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        process.arguments = ["status", "--porcelain"]
        process.currentDirectoryURL = URL(fileURLWithPath: path)
        
        // Capture output to avoid cluttering logs
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        
        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            logger.debug("Git validation failed for \(path): \(error.localizedDescription)")
            return false
        }
    }
    
    /// Checks if a path is a directory
    /// - Parameter path: Path to check
    /// - Returns: True if path is a directory
    private func isDirectory(at path: String) -> Bool {
        var isDirectory: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory)
        return exists && isDirectory.boolValue
    }
    
    /// Gets current git branch name for a repository
    /// - Parameter path: Repository path
    /// - Returns: Current branch name or "unknown"
    func getCurrentBranch(for path: String) async -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        process.arguments = ["branch", "--show-current"]
        process.currentDirectoryURL = URL(fileURLWithPath: path)
        
        let pipe = Pipe()
        process.standardOutput = pipe
        
        do {
            try process.run()
            process.waitUntilExit()
            
            if process.terminationStatus == 0 {
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
                return output ?? "unknown"
            }
        } catch {
            logger.debug("Failed to get branch for \(path): \(error.localizedDescription)")
        }
        
        return "unknown"
    }
    
    /// Gets repository status (clean, modified, etc.)
    /// - Parameter path: Repository path
    /// - Returns: Repository status summary
    func getRepositoryStatus(for path: String) async -> (hasChanges: Bool, changedFiles: Int) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        process.arguments = ["status", "--porcelain"]
        process.currentDirectoryURL = URL(fileURLWithPath: path)
        
        let pipe = Pipe()
        process.standardOutput = pipe
        
        do {
            try process.run()
            process.waitUntilExit()
            
            if process.terminationStatus == 0 {
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let output = String(data: data, encoding: .utf8) ?? ""
                let lines = output.components(separatedBy: .newlines).filter { !$0.isEmpty }
                
                return (hasChanges: !lines.isEmpty, changedFiles: lines.count)
            }
        } catch {
            logger.debug("Failed to get status for \(path): \(error.localizedDescription)")
        }
        
        return (hasChanges: false, changedFiles: 0)
    }
}

// MARK: - RepositoryConfig Extension for Set operations

extension RepositoryConfig: Hashable {
    func hash(into hasher: inout Hasher) {
        hasher.combine(path)
    }
}