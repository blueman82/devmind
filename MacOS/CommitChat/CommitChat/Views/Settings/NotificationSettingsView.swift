//
//  NotificationSettingsView.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI

/// Notification preferences settings tab
struct NotificationSettingsView: View {
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