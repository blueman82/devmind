//
//  RestorePointsWindow.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI

struct RestorePointsWindow: View {
    @StateObject private var appState = AppState()
    @State private var selectedRestorePoint: RestorePoint?
    @State private var showingConfirmation = false
    @State private var searchText = ""
    
    var body: some View {
        VStack(spacing: 0) {
            // Warning header
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.title2)
                    .foregroundColor(.orange)
                
                VStack(alignment: .leading) {
                    Text("Git Restore Points")
                        .font(.headline)
                    Text("Restore your project to a previous working state. This will affect your git repository.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
            }
            .padding()
            .background(Color.orange.opacity(0.1))
            
            // Search bar
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                TextField("Search restore points...", text: $searchText)
                    .textFieldStyle(.plain)
            }
            .padding(8)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(8)
            .padding()
            
            Divider()
            
            // Two-pane layout
            HSplitView {
                // Left: Restore points list
                List(selection: $selectedRestorePoint) {
                    ForEach(RestorePoint.mockData) { point in
                        RestorePointRow(point: point)
                            .tag(point)
                    }
                }
                .listStyle(SidebarListStyle())
                .frame(minWidth: 300)
                
                // Right: Preview pane
                if let point = selectedRestorePoint {
                    RestorePointPreview(point: point) {
                        showingConfirmation = true
                    }
                } else {
                    ContentUnavailableView {
                        Label("Select a Restore Point", systemImage: "clock.arrow.circlepath")
                    } description: {
                        Text("Choose a restore point to preview changes")
                    }
                }
            }
        }
        .frame(minWidth: 800, minHeight: 500)
        .alert("Confirm Restore", isPresented: $showingConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Restore", role: .destructive) {
                performRestore()
            }
        } message: {
            Text("This will restore your project to the selected state. Current uncommitted changes will be stashed. Continue?")
        }
    }
    
    private func performRestore() {
        // Phase 3: Will execute actual git restore
        print("Restoring to: \(selectedRestorePoint?.label ?? "")")
    }
}

// RestorePoint struct has been moved to Models/MockData.swift to avoid duplication
// Import is handled through the project's implicit imports

struct RestorePointRow: View {
    let point: RestorePoint
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(point.label)
                        .font(.headline)
                    
                    Image(systemName: point.testStatus.icon)
                        .foregroundColor(Color(point.testStatus.color))
                        .font(.caption)
                }
                
                Text(point.message)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                
                HStack {
                    Text(point.commit)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundColor(.secondary.opacity(0.6))
                    
                    Text("•")
                        .foregroundColor(.secondary.opacity(0.6))
                    
                    Text(point.date, style: .relative)
                        .font(.caption)
                        .foregroundColor(.secondary.opacity(0.6))
                }
            }
            
            Spacer()
        }
        .padding(.vertical, 4)
    }
}

struct RestorePointPreview: View {
    let point: RestorePoint
    let onRestore: () -> Void
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                VStack(alignment: .leading, spacing: 8) {
                    Text(point.label)
                        .font(.largeTitle)
                        .bold()
                    
                    Text(point.message)
                        .font(.body)
                        .foregroundColor(.secondary)
                }
                
                // Metadata
                HStack(spacing: 20) {
                    Label(point.commit, systemImage: "number")
                        .font(.system(.body, design: .monospaced))
                    
                    Label(point.author, systemImage: "person")
                    
                    Label {
                        Text(point.date, style: .date) +
                        Text(" at ") +
                        Text(point.date, style: .time)
                    } icon: {
                        Image(systemName: "calendar")
                    }
                }
                .foregroundColor(.secondary)
                
                Divider()
                
                // Statistics
                HStack(spacing: 30) {
                    StatCard(
                        title: "Files Changed",
                        value: "\(point.filesChanged)",
                        icon: "doc.on.doc",
                        color: .blue
                    )
                    
                    StatCard(
                        title: "Additions",
                        value: "+\(point.insertions)",
                        icon: "plus.circle",
                        color: .green
                    )
                    
                    StatCard(
                        title: "Deletions",
                        value: "-\(point.deletions)",
                        icon: "minus.circle",
                        color: .red
                    )
                    
                    StatCard(
                        title: "Test Status",
                        value: String(describing: point.testStatus).capitalized,
                        icon: point.testStatus.icon,
                        color: Color(point.testStatus.color)
                    )
                }
                
                // File changes preview
                VStack(alignment: .leading, spacing: 8) {
                    Text("Files to be restored:")
                        .font(.headline)
                    
                    VStack(alignment: .leading, spacing: 4) {
                        FileChangeRow(name: "src/auth/login.js", status: .modified)
                        FileChangeRow(name: "src/auth/register.js", status: .modified)
                        FileChangeRow(name: "tests/auth.test.js", status: .added)
                        FileChangeRow(name: "old-auth.js", status: .deleted)
                    }
                    .padding()
                    .background(Color(NSColor.controlBackgroundColor))
                    .cornerRadius(8)
                }
                
                // Action buttons
                HStack {
                    Button("View in Git") {
                        // Open in git client
                    }
                    .buttonStyle(.accessoryBar)
                    
                    Spacer()
                    
                    Button("Cancel") {
                        // Close window
                    }
                    .keyboardShortcut(.escape)
                    
                    Button("Restore to This Point") {
                        onRestore()
                    }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.return)
                }
                
                Spacer()
            }
            .padding()
        }
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(color)
            
            Text(value)
                .font(.headline)
            
            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(8)
    }
}

struct FileChangeRow: View {
    let name: String
    let status: FileStatus
    
    enum FileStatus {
        case added, modified, deleted
        
        var color: Color {
            switch self {
            case .added: return .green
            case .modified: return .orange
            case .deleted: return .red
            }
        }
        
        var icon: String {
            switch self {
            case .added: return "plus.circle"
            case .modified: return "pencil.circle"
            case .deleted: return "minus.circle"
            }
        }
    }
    
    var body: some View {
        HStack {
            Image(systemName: status.icon)
                .foregroundColor(status.color)
            
            Text(name)
                .font(.system(.body, design: .monospaced))
            
            Spacer()
            
            Text(String(describing: status).capitalized)
                .font(.caption)
                .foregroundColor(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(status.color.opacity(0.2))
                .cornerRadius(4)
        }
    }
}

#Preview {
    RestorePointsWindow()
}