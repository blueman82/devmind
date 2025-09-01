//
//  MCPServerSettingsView.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI

/// MCP Server configuration settings tab
struct MCPServerSettingsView: View {
    @ObservedObject private var appState = AppState()
    @State private var serverPort = "3000"
    @State private var maxMemory = "512"
    
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("MCP Server")
                .font(.title)
                .bold()
            
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Server Path:")
                        TextField("Path", text: $serverPath)
                            .textFieldStyle(.squareBorder)
                        Button("Browse...") {
                            // Open file picker
                        }
                    }
                    
                    HStack {
                        Text("Port:")
                        TextField("Port", text: $serverPort)
                            .textFieldStyle(.squareBorder)
                            .frame(width: 80)
                        
                        Spacer()
                        
                        Text("Max Memory (MB):")
                        TextField("Memory", text: $maxMemory)
                            .textFieldStyle(.squareBorder)
                            .frame(width: 80)
                    }
                }
                .padding(.vertical, 4)
            } label: {
                Label("Configuration", systemImage: "server.rack")
            }
            
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Circle()
                            .fill(appState.isConnected ? Color.green : Color.red)
                            .frame(width: 8, height: 8)
                        Text(appState.isConnected ? "Connected" : "Disconnected")
                        Spacer()
                        if appState.isConnected {
                            Button("Restart") {
                                // Restart server
                            }
                            .buttonStyle(.accessoryBar)
                        } else {
                            Button("Connect") {
                                // Connect to server
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                    
                    if appState.isConnected {
                        Divider()
                        HStack {
                            Label("\(appState.conversationCount) conversations", systemImage: "bubble.left.and.bubble.right")
                            Spacer()
                            Label("\(appState.restorePointCount) restore points", systemImage: "clock.arrow.circlepath")
                        }
                        .font(.caption)
                        .foregroundColor(.secondary)
                    }
                }
                .padding(.vertical, 4)
            } label: {
                Label("Status", systemImage: "circle.fill")
            }
        }
    }
}