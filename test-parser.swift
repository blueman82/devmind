#!/usr/bin/env swift

import Foundation

// Test the JSONLParser
let parser = JSONLParser()
let testFile = "/Users/harrison/Documents/Github/devmind/test-conversation.jsonl"

do {
    print("🧪 Testing JSONLParser with: \(testFile)")
    
    let conversation = try parser.parseConversation(at: testFile)
    
    print("✅ Parser Success!")
    print("📝 Session ID: \(conversation.sessionId)")
    print("📁 Project: \(conversation.projectPath)")
    print("💬 Title: \(conversation.title)")
    print("📊 Messages: \(conversation.messages.count)")
    print("🏷️ Topics: \(conversation.topics.joined(separator: ", "))")
    print("📄 File References: \(conversation.fileReferences.joined(separator: ", "))")
    
    print("\n💬 Messages:")
    for message in conversation.messages {
        print("  - [\(message.role)]: \(message.content.prefix(50))...")
        if !message.toolCalls.isEmpty {
            print("    Tools: \(message.toolCalls.joined(separator: ", "))")
        }
    }
    
} catch {
    print("❌ Parser Error: \(error)")
}