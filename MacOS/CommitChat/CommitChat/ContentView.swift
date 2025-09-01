//
//  ContentView.swift
//  CommitChat
//
//  Created by Gary Harrison on 31/08/2025.
//

import SwiftUI

struct ContentView: View {
    @StateObject private var appState = AppState()
    @StateObject private var windowManager = WindowManager.shared
    @State private var hoveredItem: String? = nil
    
    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                Image(systemName: "brain")
                    .foregroundColor(.blue)
                Text("CommitChat")
                    .font(.headline)
                Spacer()
                Circle()
                    .fill(appState.isConnected ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                    .overlay(
                        Circle()
                            .fill(appState.isConnected ? Color.green : Color.red)
                            .frame(width: 8, height: 8)
                            .opacity(0.5)
                            .scaleEffect(appState.isConnected ? 1.5 : 1.0)
                            .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true), value: appState.isConnected)
                    )
            }
            .padding(.horizontal)
            
            Divider()
            
            // Menu Items with actual window opening
            VStack(alignment: .leading, spacing: 8) {
                MenuBarItem(
                    icon: "magnifyingglass",
                    title: "Search Conversations",
                    isHovered: hoveredItem == "search",
                    action: { windowManager.openSearchWindow() },
                    onHover: { hoveredItem = $0 ? "search" : nil }
                )
                
                MenuBarItem(
                    icon: "folder.badge.gearshape",
                    title: "Browse Conversations",
                    isHovered: hoveredItem == "browse",
                    action: { windowManager.openMainBrowser() },
                    onHover: { hoveredItem = $0 ? "browse" : nil }
                )
                
                MenuBarItem(
                    icon: "clock.arrow.circlepath",
                    title: "Restore Points",
                    isHovered: hoveredItem == "restore",
                    action: { windowManager.openRestorePoints() },
                    onHover: { hoveredItem = $0 ? "restore" : nil }
                )
                
                MenuBarItem(
                    icon: "gearshape",
                    title: "Settings",
                    isHovered: hoveredItem == "settings",
                    action: { windowManager.openSettings() },
                    onHover: { hoveredItem = $0 ? "settings" : nil }
                )
            }
            .padding(.horizontal)
            
            Spacer()
            
            // Status info
            if appState.isConnected {
                VStack(spacing: 4) {
                    Text("\(appState.conversationCount) conversations")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    if let syncTime = appState.lastSyncTime {
                        Text("Last sync: \(syncTime, style: .relative)")
                            .font(.caption2)
                            .foregroundColor(.secondary.opacity(0.6))
                    }
                }
                .padding(.horizontal)
            }
            
            // Quit button
            Divider()
            Button("Quit CommitChat") {
                NSApplication.shared.terminate(nil)
            }
            .buttonStyle(.plain)
            .foregroundColor(.secondary)
            .padding()
        }
        .padding(.vertical)
        .background(Color(NSColor.windowBackgroundColor))
    }
    
    // Note: Window management methods have been moved to WindowManager.swift
    // The WindowManager class caches window instances to avoid recreating them on each open
    // This improves performance and prevents duplicate window creation
    
    private func openSearchWindow() {
        if appState.showSearchWindow {
            // Window already open, bring to front
            for window in NSApplication.shared.windows {
                if window.title == "Search Conversations" {
                    window.makeKeyAndOrderFront(nil)
                    return
                }
            }
        }
        
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 600, height: 500),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.title = "Search Conversations"
        window.contentView = NSHostingView(rootView: SearchWindow())
        window.makeKeyAndOrderFront(nil)
        appState.showSearchWindow = true
    }
    
    private func openMainBrowser() {
        if appState.showMainBrowser {
            for window in NSApplication.shared.windows {
                if window.title == "Conversation Browser" {
                    window.makeKeyAndOrderFront(nil)
                    return
                }
            }
        }
        
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 600),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.title = "Conversation Browser"
        window.contentView = NSHostingView(rootView: MainBrowserWindow())
        window.makeKeyAndOrderFront(nil)
        appState.showMainBrowser = true
    }
    
    private func openRestorePoints() {
        if appState.showRestorePoints {
            for window in NSApplication.shared.windows {
                if window.title == "Git Restore Points" {
                    window.makeKeyAndOrderFront(nil)
                    return
                }
            }
        }
        
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 800, height: 500),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.title = "Git Restore Points"
        window.contentView = NSHostingView(rootView: RestorePointsWindow())
        window.makeKeyAndOrderFront(nil)
        appState.showRestorePoints = true
    }
    
    private func openSettings() {
        if appState.showSettings {
            for window in NSApplication.shared.windows {
                if window.title == "Settings" {
                    window.makeKeyAndOrderFront(nil)
                    return
                }
            }
        }
        
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 700, height: 500),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.title = "Settings"
        window.contentView = NSHostingView(rootView: SettingsWindow())
        window.makeKeyAndOrderFront(nil)
        appState.showSettings = true
    }
}

struct MenuBarItem: View {
    let icon: String
    let title: String
    let isHovered: Bool
    let action: () -> Void
    let onHover: (Bool) -> Void
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .frame(width: 20)
                .foregroundColor(isHovered ? .accentColor : .secondary)
                .scaleEffect(isHovered ? 1.1 : 1.0)
                .animation(.easeInOut(duration: 0.15), value: isHovered)
            
            Text(title)
                .font(.system(size: 14))
                .foregroundColor(isHovered ? .primary : .secondary)
            
            Spacer()
            
            if isHovered {
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(.secondary.opacity(0.6))
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(isHovered ? Color.accentColor.opacity(0.1) : Color.clear)
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: action)
        .onHover(perform: onHover)
    }
}

#Preview {
    ContentView()
}
