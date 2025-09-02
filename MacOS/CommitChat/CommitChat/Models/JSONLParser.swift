//
//  JSONLParser.swift
//  CommitChat
//
//  Created on 2025-09-02.
//

import Foundation

class JSONLParser {
    
    enum ParserError: LocalizedError {
        case fileNotFound(String)
        case invalidJSON(String)
        case missingRequiredField(String)
        case invalidFormat(String)
        
        var errorDescription: String? {
            switch self {
            case .fileNotFound(let path):
                return "JSONL file not found at path: \(path)"
            case .invalidJSON(let line):
                return "Invalid JSON in line: \(line)"
            case .missingRequiredField(let field):
                return "Missing required field: \(field)"
            case .invalidFormat(let message):
                return "Invalid JSONL format: \(message)"
            }
        }
    }
    
    func parseConversation(at path: String) throws -> IndexableConversation {
        let url = URL(fileURLWithPath: path)
        
        guard FileManager.default.fileExists(atPath: path) else {
            throw ParserError.fileNotFound(path)
        }
        
        let data = try Data(contentsOf: url)
        let content = String(data: data, encoding: .utf8) ?? ""
        let lines = content.components(separatedBy: .newlines).filter { !$0.isEmpty }
        
        var messages: [IndexableMessage] = []
        var sessionId: String?
        var projectPath = url.deletingLastPathComponent().path
        var title = "Untitled Conversation"
        var createdAt = Date()
        var updatedAt = Date()
        var fileReferences = Set<String>()
        var topics = Set<String>()
        
        for (index, line) in lines.enumerated() {
            guard let lineData = line.data(using: .utf8) else {
                continue
            }
            
            do {
                if let json = try JSONSerialization.jsonObject(with: lineData) as? [String: Any] {
                    // Parse Claude Code JSONL format
                    // Extract session ID from first line if available
                    if sessionId == nil {
                        sessionId = json["sessionId"] as? String
                    }
                    
                    // Extract working directory for project path
                    if let cwd = json["cwd"] as? String {
                        // Use the last component of working directory as project name
                        let projectName = URL(fileURLWithPath: cwd).lastPathComponent
                        if !projectName.isEmpty && projectName != "/" {
                            projectPath = projectName
                        }
                    }
                    
                    // Parse timestamp
                    if let timestampString = json["timestamp"] as? String {
                        if let date = parseDate(from: timestampString) {
                            if createdAt == Date() { // Only set if not already set
                                createdAt = date
                            }
                            updatedAt = date
                        }
                    }
                    
                    // Parse message content
                    if let message = json["message"] as? [String: Any] {
                        if let messageObj = parseClaudeCodeMessage(from: json, message: message) {
                            messages.append(messageObj)
                            
                            // Extract file references from content
                            let refs = extractFileReferences(from: messageObj.content)
                            fileReferences.formUnion(refs)
                            
                            // Extract topics from content
                            let messageTopics = extractTopics(from: messageObj.content)
                            topics.formUnion(messageTopics)
                        }
                    }
                }
            } catch {
                print("Failed to parse JSON at line \(index + 1): \(error)")
            }
        }
        
        // If we couldn't find a session ID, generate one from the file path
        if sessionId == nil {
            sessionId = generateSessionId(from: path)
        }
        
        // Extract project name from path if needed
        if projectPath.contains("/.claude/projects/") {
            let components = projectPath.components(separatedBy: "/.claude/projects/")
            if components.count > 1 {
                let projectName = components[1].components(separatedBy: "/").first ?? "unknown"
                projectPath = projectName
            }
        }
        
        return IndexableConversation(
            sessionId: sessionId ?? UUID().uuidString,
            projectPath: projectPath,
            title: title,
            createdAt: createdAt,
            updatedAt: updatedAt,
            messages: messages,
            topics: Array(topics),
            fileReferences: Array(fileReferences)
        )
    }
    
    private func parseClaudeCodeMessage(from json: [String: Any], message: [String: Any]) -> IndexableMessage? {
        guard let id = json["uuid"] as? String else {
            return nil
        }
        
        let role = message["role"] as? String ?? "unknown"
        let content = message["content"] as? String ?? ""
        
        var timestamp = Date()
        if let timestampString = json["timestamp"] as? String {
            timestamp = parseDate(from: timestampString) ?? Date()
        }
        
        // Tool calls are not directly available in this format
        let toolCalls: [String] = []
        
        return IndexableMessage(
            id: id,
            role: role,
            content: content,
            timestamp: timestamp,
            toolCalls: toolCalls
        )
    }
    
    private func parseMessage(from json: [String: Any]) -> IndexableMessage? {
        guard let id = json["id"] as? String ?? json["message_id"] as? String else {
            return nil
        }
        
        let role = json["role"] as? String ?? "unknown"
        let content = json["content"] as? String ?? ""
        
        var timestamp = Date()
        if let ts = json["timestamp"] as? TimeInterval {
            timestamp = Date(timeIntervalSince1970: ts)
        } else if let dateString = json["created_at"] as? String {
            timestamp = parseDate(from: dateString) ?? Date()
        }
        
        var toolCalls: [String] = []
        if let tools = json["tool_calls"] as? [[String: Any]] {
            toolCalls = tools.compactMap { $0["name"] as? String }
        }
        
        return IndexableMessage(
            id: id,
            role: role,
            content: content,
            timestamp: timestamp,
            toolCalls: toolCalls
        )
    }
    
    private func extractFileReferences(from content: String) -> Set<String> {
        var references = Set<String>()
        
        // Common file path patterns
        let patterns = [
            #"(?:/[\w\-./]+\.[\w]+)"#,  // Unix-style paths with extensions
            #"(?:[A-Za-z]:\\[\\\w\-./]+\.[\w]+)"#,  // Windows paths
            #"`([^`]+\.(swift|js|ts|py|go|rs|java|cpp|c|h|json|yml|yaml|md|txt))`"#  // Code blocks with files
        ]
        
        for pattern in patterns {
            if let regex = try? NSRegularExpression(pattern: pattern) {
                let matches = regex.matches(in: content, range: NSRange(content.startIndex..., in: content))
                for match in matches {
                    if let range = Range(match.range, in: content) {
                        let path = String(content[range])
                            .trimmingCharacters(in: CharacterSet(charactersIn: "`"))
                        references.insert(path)
                    }
                }
            }
        }
        
        return references
    }
    
    private func extractTopics(from content: String) -> Set<String> {
        var topics = Set<String>()
        
        // Extract potential topics based on keywords and patterns
        let keywords = [
            "implement", "fix", "bug", "feature", "refactor", "optimize",
            "database", "api", "ui", "performance", "security", "test",
            "swift", "typescript", "python", "javascript", "sql"
        ]
        
        let lowercased = content.lowercased()
        for keyword in keywords {
            if lowercased.contains(keyword) {
                topics.insert(keyword)
            }
        }
        
        // Extract hashtags or mentioned frameworks
        if let regex = try? NSRegularExpression(pattern: #"#(\w+)"#) {
            let matches = regex.matches(in: content, range: NSRange(content.startIndex..., in: content))
            for match in matches {
                if let range = Range(match.range(at: 1), in: content) {
                    topics.insert(String(content[range]).lowercased())
                }
            }
        }
        
        return topics
    }
    
    private func parseDate(from string: String) -> Date? {
        let formatters = [
            ISO8601DateFormatter(),
            DateFormatter.iso8601Full,
            DateFormatter.standardFormat
        ]
        
        for formatter in formatters {
            if formatter is ISO8601DateFormatter {
                return (formatter as! ISO8601DateFormatter).date(from: string)
            } else if let dateFormatter = formatter as? DateFormatter {
                if let date = dateFormatter.date(from: string) {
                    return date
                }
            }
        }
        
        return nil
    }
    
    private func generateSessionId(from path: String) -> String {
        // Generate a consistent session ID from file path
        let url = URL(fileURLWithPath: path)
        let filename = url.deletingPathExtension().lastPathComponent
        
        // Try to extract UUID-like pattern from filename
        if let regex = try? NSRegularExpression(pattern: #"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"#) {
            let range = NSRange(filename.startIndex..., in: filename)
            if let match = regex.firstMatch(in: filename, range: range),
               let matchRange = Range(match.range, in: filename) {
                return String(filename[matchRange])
            }
        }
        
        // Otherwise create a deterministic ID from the filename
        return "session-\(filename.replacingOccurrences(of: " ", with: "-"))"
    }
}

// MARK: - DateFormatter Extensions
extension DateFormatter {
    static let iso8601Full: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        return formatter
    }()
    
    static let standardFormat: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter
    }()
}