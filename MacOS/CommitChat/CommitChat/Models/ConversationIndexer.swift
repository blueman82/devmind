//
//  ConversationIndexer.swift
//  CommitChat
//
//  Created on 2025-09-02.
//

import Foundation
import CoreServices

class ConversationIndexer: ObservableObject {
    static let shared = ConversationIndexer()
    
    @Published var isMonitoring = false
    @Published var lastIndexedTime: Date?
    @Published var indexedCount = 0
    
    private var eventStream: FSEventStreamRef?
    private let queue = DispatchQueue(label: "com.commitchat.conversation.indexer", qos: .background)
    private let dataManager = AIMemoryDataManager.shared
    private let jsonlParser = JSONLParser()
    
    private let claudeProjectsPath: String = {
        let homeDirectory = FileManager.default.homeDirectoryForCurrentUser
        return homeDirectory.appendingPathComponent(".claude/projects").path
    }()
    
    private init() {}
    
    func startMonitoring() {
        guard !isMonitoring else { return }
        
        let pathsToWatch = [claudeProjectsPath] as CFArray
        var context = FSEventStreamContext(
            version: 0,
            info: Unmanaged.passUnretained(self).toOpaque(),
            retain: nil,
            release: nil,
            copyDescription: nil
        )
        
        let flags = UInt32(
            kFSEventStreamCreateFlagUseCFTypes |
            kFSEventStreamCreateFlagFileEvents |
            kFSEventStreamCreateFlagNoDefer
        )
        
        eventStream = FSEventStreamCreate(
            kCFAllocatorDefault,
            { (stream, contextInfo, numEvents, eventPaths, eventFlags, eventIds) in
                let indexer = Unmanaged<ConversationIndexer>.fromOpaque(contextInfo!).takeUnretainedValue()
                indexer.handleEvents(numEvents: numEvents, eventPaths: eventPaths, eventFlags: eventFlags)
            },
            &context,
            pathsToWatch,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            1.0,  // Latency in seconds
            FSEventStreamCreateFlags(flags)
        )
        
        guard let stream = eventStream else {
            print("Failed to create FSEvent stream")
            return
        }
        
        FSEventStreamSetDispatchQueue(stream, queue)
        FSEventStreamStart(stream)
        
        isMonitoring = true
        
        print("Started monitoring: \(claudeProjectsPath)")
        
        // Initial scan of existing conversations
        performInitialScan()
    }
    
    func stopMonitoring() {
        guard let stream = eventStream else { return }
        
        FSEventStreamStop(stream)
        FSEventStreamInvalidate(stream)
        FSEventStreamRelease(stream)
        eventStream = nil
        
        DispatchQueue.main.async {
            self.isMonitoring = false
        }
        
        print("Stopped monitoring")
    }
    
    private func handleEvents(numEvents: Int, eventPaths: UnsafeMutableRawPointer, eventFlags: UnsafePointer<FSEventStreamEventFlags>) {
        let paths = Unmanaged<CFArray>.fromOpaque(eventPaths).takeUnretainedValue() as! [String]
        
        for i in 0..<numEvents {
            let path = paths[i]
            let flags = eventFlags[i]
            
            // Check if it's a file event (not directory)
            if flags & UInt32(kFSEventStreamEventFlagItemIsFile) != 0 {
                // Check if it's a JSONL file
                if path.hasSuffix(".jsonl") {
                    handleFileChange(path)
                }
            }
        }
    }
    
    private func handleFileChange(_ path: String) {
        print("Detected change in: \(path)")
        
        queue.async { [weak self] in
            guard let self = self else { return }
            
            do {
                // Parse the conversation file
                let conversation = try self.jsonlParser.parseConversation(at: path)
                print("📊 Parsed conversation: \(conversation.sessionId) with \(conversation.messages.count) messages")
                
                // Index to database
                print("🔄 Starting database indexing task for: \(conversation.sessionId)")
                Task {
                    print("🗄️ Database indexing task started for: \(conversation.sessionId)")
                    do {
                        print("🔍 Calling dataManager.indexConversation for: \(conversation.sessionId)")
                        try await self.dataManager.indexConversation(conversation)
                        
                        print("✅ Database indexing successful for: \(conversation.sessionId)")
                        await MainActor.run {
                            self.indexedCount += 1
                            self.lastIndexedTime = Date()
                            print("📈 Updated indexedCount to: \(self.indexedCount)")
                        }
                        
                        print("Indexed conversation: \(conversation.sessionId)")
                    } catch {
                        print("❌ Failed to index conversation: \(conversation.sessionId)")
                        print("❌ Error details: \(error)")
                        print("❌ Error type: \(type(of: error))")
                    }
                }
            } catch {
                print("Failed to parse conversation at \(path): \(error)")
            }
        }
    }
    
    private func performInitialScan() {
        queue.async { [weak self] in
            guard let self = self else { return }
            
            let fileManager = FileManager.default
            
            // Check if the Claude projects directory exists
            guard fileManager.fileExists(atPath: self.claudeProjectsPath) else {
                print("Claude projects directory not found: \(self.claudeProjectsPath)")
                return
            }
            
            do {
                // Get all project directories
                let projectDirs = try fileManager.contentsOfDirectory(atPath: self.claudeProjectsPath)
                
                for projectDir in projectDirs {
                    let projectPath = (self.claudeProjectsPath as NSString).appendingPathComponent(projectDir)
                    
                    // Skip if not a directory
                    var isDirectory: ObjCBool = false
                    guard fileManager.fileExists(atPath: projectPath, isDirectory: &isDirectory),
                          isDirectory.boolValue else {
                        continue
                    }
                    
                    // Look for JSONL files in the project directory
                    let projectContents = try fileManager.contentsOfDirectory(atPath: projectPath)
                    
                    for file in projectContents {
                        if file.hasSuffix(".jsonl") {
                            let filePath = (projectPath as NSString).appendingPathComponent(file)
                            self.handleFileChange(filePath)
                        }
                    }
                }
                
                print("Initial scan completed")
            } catch {
                print("Error during initial scan: \(error)")
            }
        }
    }
    
    deinit {
        stopMonitoring()
    }
}

// MARK: - Conversation Model for Indexing
struct IndexableConversation {
    let sessionId: String
    let projectPath: String
    let title: String
    let createdAt: Date
    let updatedAt: Date
    let messages: [IndexableMessage]
    let topics: [String]
    let fileReferences: [String]
}

struct IndexableMessage {
    let id: String
    let role: String
    let content: String
    let timestamp: Date
    let toolCalls: [String]
}