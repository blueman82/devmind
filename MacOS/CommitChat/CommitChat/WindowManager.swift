//
//  WindowManager.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI
import AppKit

/// Manages window instances to avoid recreating them on each open
class WindowManager: ObservableObject {
    static let shared = WindowManager()
    
    // Cached window instances
    private var searchWindow: NSWindow?
    private var browserWindow: NSWindow?
    private var restoreWindow: NSWindow?
    private var settingsWindow: NSWindow?
    
    private init() {}
    
    /// Opens or focuses the search window
    func openSearchWindow() {
        if let window = searchWindow {
            window.makeKeyAndOrderFront(nil)
            return
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
        
        // Cache the window
        searchWindow = window
    }
    
    /// Opens or focuses the main browser window
    func openMainBrowser() {
        if let window = browserWindow {
            window.makeKeyAndOrderFront(nil)
            return
        }
        
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 600),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.title = "Browse Conversations"
        window.contentView = NSHostingView(rootView: MainBrowserWindow())
        window.makeKeyAndOrderFront(nil)
        
        // Cache the window
        browserWindow = window
    }
    
    /// Opens or focuses the restore points window
    func openRestorePoints() {
        if let window = restoreWindow {
            window.makeKeyAndOrderFront(nil)
            return
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
        
        // Cache the window
        restoreWindow = window
    }
    
    /// Opens or focuses the settings window
    func openSettings() {
        if let window = settingsWindow {
            window.makeKeyAndOrderFront(nil)
            return
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
        
        // Cache the window
        settingsWindow = window
    }
    
    /// Closes all cached windows
    func closeAllWindows() {
        searchWindow?.close()
        browserWindow?.close()
        restoreWindow?.close()
        settingsWindow?.close()
        
        // Clear cache references
        searchWindow = nil
        browserWindow = nil
        restoreWindow = nil
        settingsWindow = nil
    }
}