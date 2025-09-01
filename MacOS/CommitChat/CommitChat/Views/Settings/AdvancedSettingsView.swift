//
//  AdvancedSettingsView.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI

/// Advanced settings and developer options tab
struct AdvancedSettingsView: View {
    @AppStorage("debugMode") private var debugMode = false
    @AppStorage("logLevel") private var logLevel = "Info"
    
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Advanced")
                .font(.title)
                .bold()
            
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    Toggle("Debug Mode", isOn: $debugMode)
                    
                    HStack {
                        Text("Log Level:")
                        Picker("", selection: $logLevel) {
                            Text("Error").tag("Error")
                            Text("Warning").tag("Warning")
                            Text("Info").tag("Info")
                            Text("Debug").tag("Debug")
                            Text("Verbose").tag("Verbose")
                        }
                        .pickerStyle(MenuPickerStyle())
                        .frame(width: 150)
                    }
                    
                    HStack {
                        Button("Open Logs") {
                            // Open logs folder
                        }
                        
                        Button("Clear Cache") {
                            // Clear cache
                        }
                        
                        Button("Reset Settings") {
                            // Reset to defaults
                        }
                        .foregroundColor(.red)
                    }
                }
                .padding(.vertical, 4)
            } label: {
                Label("Developer Options", systemImage: "wrench.and.screwdriver")
            }
            
            GroupBox {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Version:")
                        Spacer()
                        Text("1.0.0 (Phase 2)")
                            .foregroundColor(.secondary)
                    }
                    
                    HStack {
                        Text("Build:")
                        Spacer()
                        Text("2025.09.01")
                            .foregroundColor(.secondary)
                    }
                    
                    HStack {
                        Text("MCP SDK:")
                        Spacer()
                        Text("0.1.0")
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.vertical, 4)
                .font(.system(.body, design: .monospaced))
            } label: {
                Label("About", systemImage: "info.circle")
            }
        }
    }
}