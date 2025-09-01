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
    
    private var mcpProcess: Process?
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
        guard serverStatus != .running && serverStatus != .starting else {
            print("MCP server is already running or starting")
            return
        }
        
        DispatchQueue.main.async {
            self.serverStatus = .starting
            self.lastError = nil
            self.serverOutput.removeAll()
        }
        
        // Create new process
        let process = Process()
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        
        // Configure process
        process.launchPath = "/usr/bin/env"
        process.arguments = ["node", "src/mcp-server.js"]
        process.currentDirectoryPath = projectPath
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
                if process.isRunning {
                    self.serverStatus = .running
                    print("MCP server started successfully")
                } else {
                    let error = "MCP server failed to start"
                    self.serverStatus = .error(error)
                    self.lastError = error
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
                process.kill()
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
            let data = handle.availableData
            if !data.isEmpty {
                let output = String(data: data, encoding: .utf8) ?? ""
                DispatchQueue.main.async {
                    self?.serverOutput.append(output.trimmingCharacters(in: .whitespacesAndNewlines))
                    print("MCP Server Output: \(output)")
                }
            }
        }
        
        // Monitor error output
        errorPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if !data.isEmpty {
                let error = String(data: data, encoding: .utf8) ?? ""
                DispatchQueue.main.async {
                    let errorMessage = "MCP Server Error: \(error)"
                    self?.lastError = errorMessage
                    self?.serverOutput.append(errorMessage)
                    print(errorMessage)
                }
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