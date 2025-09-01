//
//  GeneralSettingsView.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI

/// General settings tab view
struct GeneralSettingsView: View {
    @StateObject private var appState = AppState()
    @AppStorage("launchAtLogin") private var launchAtLogin = false
    @AppStorage("showInDock") private var showInDock = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("General")
                .font(.title)
                .bold()
            
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    Toggle("Launch at login", isOn: $launchAtLogin)
                    Toggle("Show in Dock", isOn: $showInDock)
                    Toggle("Auto-start MCP server", isOn: $appState.autoStartServer)
                }
                .padding(.vertical, 4)
            } label: {
                Label("Startup", systemImage: "power")
            }
            
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Check for updates:")
                        Picker("", selection: .constant("Weekly")) {
                            Text("Daily").tag("Daily")
                            Text("Weekly").tag("Weekly")
                            Text("Monthly").tag("Monthly")
                            Text("Never").tag("Never")
                        }
                        .pickerStyle(MenuPickerStyle())
                        .frame(width: 150)
                    }
                    
                    Button("Check Now") {
                        // Check for updates
                    }
                }
                .padding(.vertical, 4)
            } label: {
                Label("Updates", systemImage: "arrow.down.circle")
            }
        }
    }
}