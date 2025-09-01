//
//  ProcessManager.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import Foundation
import Combine

/// Manages the lifecycle of the Node.js MCP server process
class ProcessManager: ObservableObject {
    static let shared = ProcessManager()
    
    @Published var serverStatus: ServerStatus = .stopped
    @Published var serverOutput: [String] = []
    @Published var lastError: String?
    
    var mcpProcess: Process?
    private var outputPipe: Pipe?
    private var errorPipe: Pipe?
    private let projectPath: String
    
    enum ServerStatus {
        case stopped
        case starting
        case running
        case stopping
        case error(String)
        
        var isRunning: Bool {
            switch self {
            case .running: return true
            default: return false
            }
        }
        
        var displayText: String {
            switch self {
            case .stopped: return "Stopped"
            case .starting: return "Starting..."
            case .running: return "Running"
            case .stopping: return "Stopping..."
            case .error(let message): return "Error: \(message)"
            }
        }
    }
    
    private init() {
        // Initialize with the DevMind project path
        self.projectPath = "/Users/harrison/Documents/Github/devmind"
    }
    
    /// Start the MCP server process
    func startMCPServer() {
        print("ProcessManager: startMCPServer() called")
        print("ProcessManager: Current serverStatus = \(serverStatus)")
        guard serverStatus != .running && serverStatus != .starting else {
            print("ProcessManager: MCP server is already running or starting - exiting early")
            return
        }
        
        DispatchQueue.main.async {
            self.serverStatus = .starting
            self.lastError = nil
            self.serverOutput.removeAll()
        }
        
        // Create new process
        let process = Process()
        let inputPipe = Pipe()
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        
        // Configure process with Node.js via env
        // Using env to locate node in case of PATH issues
        process.launchPath = "/usr/bin/env"
        process.arguments = ["node", "src/mcp-server/mcp-server.js"]
        process.environment = ["PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"]
        process.currentDirectoryPath = projectPath
        process.standardInput = inputPipe
        process.standardOutput = outputPipe
        process.standardError = errorPipe
        
        // Set up output monitoring
        self.setupOutputMonitoring(outputPipe: outputPipe, errorPipe: errorPipe)
        
        // Store references
        self.mcpProcess = process
        self.outputPipe = outputPipe
        self.errorPipe = errorPipe
        
        // Launch process
        do {
            try process.run()
            
            // Monitor process termination
            process.terminationHandler = { [weak self] process in
                DispatchQueue.main.async {
                    if process.terminationStatus == 0 {
                        self?.serverStatus = .stopped
                        print("MCP server stopped normally")
                    } else {
                        let error = "MCP server crashed with exit code \(process.terminationStatus)"
                        self?.serverStatus = .error(error)
                        self?.lastError = error
                        print(error)
                    }
                    
                    self?.mcpProcess = nil
                    self?.outputPipe = nil
                    self?.errorPipe = nil
                }
            }
            
            // Give process time to start
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                print("ProcessManager: Checking process status after 1 second delay")
                print("ProcessManager: process.isRunning = \(process.isRunning)")
                if process.isRunning {
                    self.serverStatus = .running
                    print("ProcessManager: Setting serverStatus to .running")
                    print("MCP server started successfully")
                } else {
                    let error = "MCP server failed to start"
                    self.serverStatus = .error(error)
                    self.lastError = error
                    print("ProcessManager: Setting serverStatus to .error(\(error))")
                }
            }
            
        } catch {
            DispatchQueue.main.async {
                let errorMessage = "Failed to start MCP server: \(error.localizedDescription)"
                self.serverStatus = .error(errorMessage)
                self.lastError = errorMessage
                print(errorMessage)
            }
        }
    }
    
    /// Stop the MCP server process
    func stopMCPServer() {
        guard let process = mcpProcess, process.isRunning else {
            DispatchQueue.main.async {
                self.serverStatus = .stopped
            }
            return
        }
        
        DispatchQueue.main.async {
            self.serverStatus = .stopping
        }
        
        // Graceful termination
        process.terminate()
        
        // Force kill after 5 seconds if still running
        DispatchQueue.global().asyncAfter(deadline: .now() + 5.0) {
            if let process = self.mcpProcess, process.isRunning {
                print("Force killing MCP server process")
                // Send SIGKILL signal to force termination
                kill(process.processIdentifier, SIGKILL)
            }
        }
    }
    
    /// Restart the MCP server
    func restartMCPServer() {
        if serverStatus.isRunning {
            stopMCPServer()
            // Wait for stop to complete before starting
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                self.startMCPServer()
            }
        } else {
            startMCPServer()
        }
    }
    
    /// Check if Node.js is available
    func checkNodeAvailability() -> Bool {
        let process = Process()
        process.launchPath = "/usr/bin/env"
        process.arguments = ["which", "node"]
        process.standardOutput = Pipe()
        
        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            return false
        }
    }
    
    /// Get MCP server health status
    func getServerHealth() -> (isHealthy: Bool, message: String) {
        guard serverStatus.isRunning else {
            return (false, "Server is not running")
        }
        
        guard let process = mcpProcess, process.isRunning else {
            return (false, "Process is not active")
        }
        
        // Basic health check - process is running
        return (true, "Server is running")
    }
    
    // MARK: - Private Methods
    
    private func setupOutputMonitoring(outputPipe: Pipe, errorPipe: Pipe) {
        // Monitor standard output
        outputPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            print("ProcessManager: readabilityHandler called")
            let data = handle.availableData
            print("ProcessManager: availableData size = \(data.count) bytes")
            
            if !data.isEmpty {
                let output = String(data: data, encoding: .utf8) ?? ""
                print("ProcessManager: raw output = '\(output)'")
                print("ProcessManager: output.isEmpty = \(output.isEmpty)")
                
                DispatchQueue.main.async {
                    self?.serverOutput.append(output.trimmingCharacters(in: .whitespacesAndNewlines))
                    print("MCP Server Output: \(output)")
                    
                    // Strip ALL ANSI color codes before pattern matching (comprehensive regex)
                    var cleanOutput = output.replacingOccurrences(of: "\\u001b\\[[0-9;]*m", with: "", options: .regularExpression)
                    cleanOutput = cleanOutput.replacingOccurrences(of: "\\033\\[[0-9;]*m", with: "", options: .regularExpression)
                    cleanOutput = cleanOutput.replacingOccurrences(of: "\\e\\[[0-9;]*m", with: "", options: .regularExpression)
                    cleanOutput = cleanOutput.replacingOccurrences(of: "\\[[0-9;]*m", with: "", options: .regularExpression)
                    print("ProcessManager: cleaned output = '\(cleanOutput)'")
                    
                    // Enhanced debugging for pattern matching
                    let pattern1 = "MCP Server connected on stdio transport"
                    let pattern2 = "AI Memory MCP Server running on stdio"
                    let containsPattern1 = cleanOutput.contains(pattern1)
                    let containsPattern2 = cleanOutput.contains(pattern2)
                    
                    print("ProcessManager: Checking patterns:")
                    print("ProcessManager:   - Pattern1 '\(pattern1)': \(containsPattern1)")
                    print("ProcessManager:   - Pattern2 '\(pattern2)': \(containsPattern2)")
                    print("ProcessManager:   - Current serverStatus: \(self?.serverStatus.displayText ?? "unknown")")
                    
                    // Alternative status detection: look for server startup messages
                    if containsPattern1 || containsPattern2 {
                        print("ProcessManager: ✅ PATTERN MATCHED! Detected MCP server startup via output")
                        if self?.serverStatus != .running {
                            self?.serverStatus = .running
                            print("ProcessManager: ✅ Setting serverStatus to .running via output detection")
                        } else {
                            print("ProcessManager: ⚠️  Server already marked as running, no status change needed")
                        }
                    } else {
                        print("ProcessManager: ❌ No startup patterns found in this output")
                    }
                }
            } else {
                print("ProcessManager: availableData is empty, skipping")
            }
        }
        
        // Monitor error output (MCP server uses console.error for startup messages)
        errorPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            print("ProcessManager: ERROR readabilityHandler called")
            let data = handle.availableData
            print("ProcessManager: ERROR availableData size = \(data.count) bytes")
            
            if !data.isEmpty {
                let error = String(data: data, encoding: .utf8) ?? ""
                print("ProcessManager: ERROR raw output = '\(error)'")
                
                DispatchQueue.main.async {
                    // Check for MCP server startup message in stderr first
                    let startupPattern = "AI Memory MCP Server running on stdio"
                    let containsStartup = error.contains(startupPattern)
                    
                    print("ProcessManager: ERROR - Checking for startup pattern:")
                    print("ProcessManager: ERROR - Pattern '\(startupPattern)': \(containsStartup)")
                    print("ProcessManager: ERROR - Current serverStatus: \(self?.serverStatus.displayText ?? "unknown")")
                    
                    if containsStartup {
                        print("ProcessManager: ✅ STDERR STARTUP DETECTED! Found MCP server startup in stderr")
                        if self?.serverStatus != .running {
                            self?.serverStatus = .running
                            print("ProcessManager: ✅ Setting serverStatus to .running via STDERR detection")
                        } else {
                            print("ProcessManager: ⚠️  Server already marked as running via stderr")
                        }
                        // Don't treat startup message as an error
                        self?.serverOutput.append("MCP Server Startup: \(error.trimmingCharacters(in: .whitespacesAndNewlines))")
                    } else {
                        // Regular error handling
                        let errorMessage = "MCP Server Error: \(error)"
                        self?.lastError = errorMessage
                        self?.serverOutput.append(errorMessage)
                        print(errorMessage)
                    }
                }
            } else {
                print("ProcessManager: ERROR availableData is empty, skipping")
            }
        }
    }
    
    deinit {
        stopMCPServer()
    }
}

// MARK: - Server Status Extensions

extension ProcessManager.ServerStatus: Equatable {
    static func == (lhs: ProcessManager.ServerStatus, rhs: ProcessManager.ServerStatus) -> Bool {
        switch (lhs, rhs) {
        case (.stopped, .stopped),
             (.starting, .starting),
             (.running, .running),
             (.stopping, .stopping):
            return true
        case (.error(let lhsMessage), .error(let rhsMessage)):
            return lhsMessage == rhsMessage
        default:
            return false
        }
    }
}