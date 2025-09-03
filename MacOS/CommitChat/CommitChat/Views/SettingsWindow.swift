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
                
                Label("Repository Management", systemImage: "folder.badge.gearshape")
                    .tag("Repository")
                
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

// Note: Individual settings views have been extracted to separate files:
// - Views/Settings/GeneralSettingsView.swift
// - Views/Settings/MCPServerSettingsView.swift
// - Views/Settings/AppearanceSettingsView.swift
// - Views/Settings/SearchSettingsView.swift
// - Views/Settings/NotificationSettingsView.swift
// - Views/Settings/AdvancedSettingsView.swift

#Preview {
    SettingsWindow()
}