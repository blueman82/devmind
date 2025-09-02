//
//  CommitChatApp.swift
//  CommitChat
//
//  Created by Gary Harrison on 31/08/2025.
//

import SwiftUI

@main
struct CommitChatApp: App {
    init() {
        print("🚀 CommitChat App initializing...")
        
        // Initialize database with detailed logging
        print("🗄️ Initializing AIMemoryDataManagerFixed...")
        let dataManager = AIMemoryDataManagerFixed.shared
        print("✅ AIMemoryDataManager initialized: \(dataManager)")
        
        // Start conversation monitoring with detailed status
        print("👀 Starting ConversationIndexer...")
        ConversationIndexer.shared.startMonitoring()
        
        // Verify indexer status
        let isMonitoring = ConversationIndexer.shared.isMonitoring
        let indexedCount = ConversationIndexer.shared.indexedCount
        print("📊 ConversationIndexer Status:")
        print("   - isMonitoring: \(isMonitoring)")
        print("   - indexedCount: \(indexedCount)")
        print("   - lastIndexedTime: \(ConversationIndexer.shared.lastIndexedTime?.description ?? "never")")
        
        // Check if Claude projects directory exists
        let homeDir = FileManager.default.homeDirectoryForCurrentUser
        let claudeProjectsURL = homeDir.appendingPathComponent(".claude/projects")
        let claudeProjectsExists = FileManager.default.fileExists(atPath: claudeProjectsURL.path)
        print("📁 Claude projects directory exists: \(claudeProjectsExists) at \(claudeProjectsURL.path)")
        
        if claudeProjectsExists {
            do {
                let contents = try FileManager.default.contentsOfDirectory(atPath: claudeProjectsURL.path)
                print("📁 Found \(contents.count) project directories")
                
                // Count total JSONL files
                var totalJSONLFiles = 0
                for projectDir in contents.prefix(5) { // Check first 5 directories
                    let projectPath = claudeProjectsURL.appendingPathComponent(projectDir)
                    if let projectContents = try? FileManager.default.contentsOfDirectory(atPath: projectPath.path) {
                        let jsonlFiles = projectContents.filter { $0.hasSuffix(".jsonl") }
                        totalJSONLFiles += jsonlFiles.count
                        if !jsonlFiles.isEmpty {
                            print("   - \(projectDir): \(jsonlFiles.count) JSONL files")
                        }
                    }
                }
                print("📊 Total JSONL files found (sample): \(totalJSONLFiles)")
            } catch {
                print("❌ Error reading Claude projects directory: \(error)")
            }
        }
        
        print("🧠 AI Memory App started - monitoring conversations")
    }
    
    var body: some Scene {
        MenuBarExtra("AI Memory", systemImage: "brain") {
            ContentView()
                .frame(width: 320, height: 400)
        }
        .menuBarExtraStyle(.window)
    }
}
