//
//  CommitChatApp.swift
//  CommitChat
//
//  Created by Gary Harrison on 31/08/2025.
//

import SwiftUI
import os

@main
struct CommitChatApp: App {
    private static let logger = Logger(subsystem: "com.commitchat", category: "CommitChatApp")
    
    init() {
        Self.logger.debug("🚀 CommitChat App initializing...")
        
        // Initialize database with detailed logging
        Self.logger.debug("🗄️ Initializing AIMemoryDataManagerFixed...")
        let dataManager = AIMemoryDataManagerFixed.shared
        Self.logger.debug("✅ AIMemoryDataManager initialized: \(dataManager)")
        
        // Start conversation monitoring with detailed status
        Self.logger.debug("👀 Starting ConversationIndexer...")
        ConversationIndexer.shared.startMonitoring()
        
        // Verify indexer status
        let isMonitoring = ConversationIndexer.shared.isMonitoring
        let indexedCount = ConversationIndexer.shared.indexedCount
        Self.logger.debug("📊 ConversationIndexer Status:")
        Self.logger.debug("   - isMonitoring: \(isMonitoring)")
        Self.logger.debug("   - indexedCount: \(indexedCount)")
        Self.logger.debug("   - lastIndexedTime: \(ConversationIndexer.shared.lastIndexedTime?.description ?? "never")")
        
        // Check if Claude projects directory exists
        let homeDir = FileManager.default.homeDirectoryForCurrentUser
        let claudeProjectsURL = homeDir.appendingPathComponent(".claude/projects")
        let claudeProjectsExists = FileManager.default.fileExists(atPath: claudeProjectsURL.path)
        Self.logger.debug("📁 Claude projects directory exists: \(claudeProjectsExists) at \(claudeProjectsURL.path)")
        
        if claudeProjectsExists {
            do {
                let contents = try FileManager.default.contentsOfDirectory(atPath: claudeProjectsURL.path)
                Self.logger.debug("📁 Found \(contents.count) project directories")
                
                // Count total JSONL files
                var totalJSONLFiles = 0
                for projectDir in contents.prefix(5) { // Check first 5 directories
                    let projectPath = claudeProjectsURL.appendingPathComponent(projectDir)
                    if let projectContents = try? FileManager.default.contentsOfDirectory(atPath: projectPath.path) {
                        let jsonlFiles = projectContents.filter { $0.hasSuffix(".jsonl") }
                        totalJSONLFiles += jsonlFiles.count
                        if !jsonlFiles.isEmpty {
                            Self.logger.debug("   - \(projectDir): \(jsonlFiles.count) JSONL files")
                        }
                    }
                }
                Self.logger.debug("📊 Total JSONL files found (sample): \(totalJSONLFiles)")
            } catch {
                Self.logger.error("❌ Error reading Claude projects directory: \(error.localizedDescription)")
            }
        }
        
        Self.logger.debug("🧠 AI Memory App started - monitoring conversations")
    }
    
    var body: some Scene {
        MenuBarExtra("AI Memory", systemImage: "brain") {
            ContentView()
                .frame(width: 320, height: 400)
        }
        .menuBarExtraStyle(.window)
    }
}