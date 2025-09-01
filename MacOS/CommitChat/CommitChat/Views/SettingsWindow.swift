//
//  SettingsWindow.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI

/// Main settings window with sidebar navigation
struct SettingsWindow: View {
    @State private var selectedTab = "General"
    
    var body: some View {
        NavigationSplitView {
            // Sidebar with setting categories
            List(selection: $selectedTab) {
                Label("General", systemImage: "gearshape")
                    .tag("General")
                
                Label("MCP Server", systemImage: "server.rack")
                    .tag("MCP")
                
                Label("Appearance", systemImage: "paintbrush")
                    .tag("Appearance")
                
                Label("Search", systemImage: "magnifyingglass")
                    .tag("Search")
                
                Label("Notifications", systemImage: "bell")
                    .tag("Notifications")
                
                Label("Advanced", systemImage: "wrench.and.screwdriver")
                    .tag("Advanced")
            }
            .listStyle(SidebarListStyle())
            .frame(width: 200)
        } detail: {
            // Settings content based on selected tab
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    switch selectedTab {
                    case "General":
                        GeneralSettingsView()
                    case "MCP":
                        MCPServerSettingsView()
                    case "Appearance":
                        AppearanceSettingsView()
                    case "Search":
                        SearchSettingsView()
                    case "Notifications":
                        NotificationSettingsView()
                    case "Advanced":
                        AdvancedSettingsView()
                    default:
                        EmptyView()
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .frame(minWidth: 700, minHeight: 500)
    }
}

struct GeneralSettings: View {
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

struct MCPServerSettings: View {
    @StateObject private var appState = AppState()
    @State private var serverPath = ""
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

struct AppearanceSettings: View {
    @AppStorage("colorScheme") private var colorScheme = "Auto"
    @AppStorage("accentColor") private var accentColor = "Blue"
    @AppStorage("fontSize") private var fontSize = "Medium"
    
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Appearance")
                .font(.title)
                .bold()
            
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Theme:")
                        Picker("", selection: $colorScheme) {
                            Text("Auto").tag("Auto")
                            Text("Light").tag("Light")
                            Text("Dark").tag("Dark")
                        }
                        .pickerStyle(SegmentedPickerStyle())
                        .frame(width: 200)
                    }
                    
                    HStack {
                        Text("Accent Color:")
                        Picker("", selection: $accentColor) {
                            Text("Blue").tag("Blue")
                            Text("Purple").tag("Purple")
                            Text("Pink").tag("Pink")
                            Text("Red").tag("Red")
                            Text("Orange").tag("Orange")
                            Text("Green").tag("Green")
                        }
                        .pickerStyle(MenuPickerStyle())
                        .frame(width: 150)
                    }
                    
                    HStack {
                        Text("Font Size:")
                        Picker("", selection: $fontSize) {
                            Text("Small").tag("Small")
                            Text("Medium").tag("Medium")
                            Text("Large").tag("Large")
                        }
                        .pickerStyle(SegmentedPickerStyle())
                        .frame(width: 200)
                    }
                }
                .padding(.vertical, 4)
            } label: {
                Label("Theme", systemImage: "paintbrush")
            }
        }
    }
}

struct SearchSettings: View {
    @AppStorage("searchScope") private var searchScope = "All"
    @AppStorage("maxResults") private var maxResults = 50
    @AppStorage("includeArchived") private var includeArchived = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Search")
                .font(.title)
                .bold()
            
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Default Scope:")
                        Picker("", selection: $searchScope) {
                            Text("All Conversations").tag("All")
                            Text("Current Project").tag("Project")
                            Text("Last 30 Days").tag("Recent")
                        }
                        .pickerStyle(MenuPickerStyle())
                        .frame(width: 200)
                    }
                    
                    HStack {
                        Text("Max Results:")
                        Slider(value: .init(get: { Double(maxResults) }, set: { maxResults = Int($0) }), 
                               in: 10...200, step: 10)
                        Text("\(maxResults)")
                            .frame(width: 40)
                    }
                    
                    Toggle("Include archived conversations", isOn: $includeArchived)
                }
                .padding(.vertical, 4)
            } label: {
                Label("Search Options", systemImage: "magnifyingglass")
            }
        }
    }
}

struct NotificationSettings: View {
    @StateObject private var appState = AppState()
    @AppStorage("notifyOnNewConversation") private var notifyOnNewConversation = true
    @AppStorage("notifyOnError") private var notifyOnError = true
    @AppStorage("notifyOnRestorePoint") private var notifyOnRestorePoint = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Notifications")
                .font(.title)
                .bold()
            
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    Toggle("Show notifications", isOn: $appState.showNotifications)
                    
                    Divider()
                    
                    Toggle("New conversation indexed", isOn: $notifyOnNewConversation)
                        .disabled(!appState.showNotifications)
                    
                    Toggle("Error detected in conversation", isOn: $notifyOnError)
                        .disabled(!appState.showNotifications)
                    
                    Toggle("Restore point created", isOn: $notifyOnRestorePoint)
                        .disabled(!appState.showNotifications)
                }
                .padding(.vertical, 4)
            } label: {
                Label("Notification Types", systemImage: "bell")
            }
        }
    }
}

struct AdvancedSettings: View {
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

#Preview {
    SettingsWindow()
}