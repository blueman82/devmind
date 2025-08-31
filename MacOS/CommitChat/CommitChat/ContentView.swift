//
//  ContentView.swift
//  CommitChat
//
//  Created by Gary Harrison on 31/08/2025.
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                Image(systemName: "brain")
                    .foregroundColor(.blue)
                Text("AI Memory")
                    .font(.headline)
                Spacer()
                Circle()
                    .fill(.green)
                    .frame(width: 8, height: 8)
            }
            .padding(.horizontal)
            
            Divider()
            
            // Menu Items (matching mockup)
            VStack(alignment: .leading, spacing: 8) {
                MenuBarItem(icon: "magnifyingglass", title: "Search Conversations")
                MenuBarItem(icon: "bookmark", title: "Recent Restore Points")
                MenuBarItem(icon: "chart.bar", title: "Project Insights")
                MenuBarItem(icon: "gearshape", title: "Settings")
            }
            .padding(.horizontal)
            
            Spacer()
            
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
}

struct MenuBarItem: View {
    let icon: String
    let title: String
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .frame(width: 16)
                .foregroundColor(.secondary)
            Text(title)
                .font(.system(size: 14))
            Spacer()
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(Color.clear)
        .contentShape(Rectangle())
        .onTapGesture {
            print("Tapped: \(title)")
        }
        .onHover { hovering in
            // Add hover effect later
        }
    }
}

#Preview {
    ContentView()
}
