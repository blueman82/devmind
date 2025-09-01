//
//  SearchWindow.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI

struct SearchWindow: View {
    @StateObject private var appState = AppState()
    @State private var searchText = ""
    @State private var selectedFilter = "All Projects"
    @State private var searchTask: Task<Void, Never>?
    @FocusState private var isSearchFocused: Bool
    
    private let mcpClient = MCPClient.shared
    
    let filters = ["All Projects", "Current Project", "Last 7 Days", "Has Code", "Has Errors"]
    
    var body: some View {
        VStack(spacing: 0) {
            // Error banner if there's a search error
            if appState.searchError != .none {
                ErrorBanner(
                    error: appState.searchError,
                    onDismiss: { appState.searchError = .none },
                    onRetry: { performSearch() }
                )
                .padding()
                .animation(.easeInOut, value: appState.searchError)
            }
            // Header with search bar
            VStack(spacing: 16) {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                        .font(.title2)
                    
                    TextField("Search conversations...", text: $searchText)
                        .textFieldStyle(.plain)
                        .font(.title3)
                        .focused($isSearchFocused)
                        .onSubmit {
                            performSearch()
                        }
                        .onChange(of: searchText) { _, newValue in
                            // Debounced search - cancel previous task
                            searchTask?.cancel()
                            
                            // Start new search task with 0.5 second delay
                            searchTask = Task {
                                try? await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
                                
                                // Check if task wasn't cancelled
                                if !Task.isCancelled {
                                    await MainActor.run {
                                        performSearch()
                                    }
                                }
                            }
                        }
                    
                    if !searchText.isEmpty {
                        Button(action: { searchText = "" }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(12)
                .background(Color(NSColor.controlBackgroundColor))
                .cornerRadius(10)
                
                // Filter chips
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(filters, id: \.self) { filter in
                            FilterChip(
                                title: filter,
                                isSelected: selectedFilter == filter,
                                action: { selectedFilter = filter }
                            )
                        }
                    }
                }
            }
            .padding()
            .background(Color(NSColor.windowBackgroundColor))
            
            Divider()
            
            // Results list
            if appState.isSearching {
                Spacer()
                ProgressView("Searching...")
                    .progressViewStyle(CircularProgressViewStyle())
                Spacer()
            } else if searchText.isEmpty {
                Spacer()
                VStack(spacing: 12) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 48))
                        .foregroundColor(.secondary)
                    Text("Search your AI conversations")
                        .font(.title3)
                        .foregroundColor(.secondary)
                    Text("Type to search across \(appState.conversationCount) conversations")
                        .font(.caption)
                        .foregroundColor(.secondary.opacity(0.6))
                }
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 1) {
                        ForEach(ConversationItem.mockData) { item in
                            ConversationRow(item: item)
                        }
                    }
                    .padding(.vertical, 1)
                }
            }
            
            // Footer with token count
            HStack {
                Text("\(ConversationItem.mockData.count) results")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Spacer()
                
                Text("~1,250 tokens")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding()
            .background(Color(NSColor.windowBackgroundColor))
        }
        .frame(width: 600, height: 500)
        .onAppear {
            isSearchFocused = true
        }
    }
    
    private func performSearch() {
        appState.searchQuery = searchText
        appState.isSearching = true
        appState.searchError = .none  // Clear any previous errors
        
        // Validate search input
        if searchText.isEmpty {
            appState.searchError = .searchFailed("Please enter a search query")
            appState.isSearching = false
            return
        }
        
        // Simulate search delay - will be replaced with MCP call in Phase 3
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            appState.isSearching = false
            
            // Mock search results
            appState.searchResults = ConversationItem.mockData
            
            // Uncomment to test error states:
            // appState.searchError = .mcpServerError("Connection timeout")
            // appState.searchError = .searchFailed("No results found for '\(searchText)'")
        }
    }
}

struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.accentColor : Color(NSColor.controlBackgroundColor))
                .foregroundColor(isSelected ? .white : .primary)
                .cornerRadius(15)
        }
        .buttonStyle(.plain)
    }
}

struct ConversationRow: View {
    let item: ConversationItem
    @State private var isHovered = false
    
    var body: some View {
        HStack(spacing: 12) {
            // Project indicator
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.accentColor.opacity(0.3))
                .frame(width: 4)
            
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(item.title)
                        .font(.system(.body, design: .rounded))
                        .lineLimit(1)
                    
                    Spacer()
                    
                    if item.hasErrors {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundColor(.red)
                            .font(.caption)
                    }
                    
                    if item.hasCode {
                        Image(systemName: "chevron.left.forwardslash.chevron.right")
                            .foregroundColor(.secondary)
                            .font(.caption)
                    }
                }
                
                HStack {
                    Label(item.project, systemImage: "folder")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Text("•")
                        .foregroundColor(.secondary.opacity(0.6))
                    
                    Text("\(item.messageCount) messages")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Text("•")
                        .foregroundColor(.secondary.opacity(0.6))
                    
                    Text(item.date, style: .relative)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            Image(systemName: "chevron.right")
                .foregroundColor(.secondary.opacity(0.6))
                .font(.caption)
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(isHovered ? Color(NSColor.selectedContentBackgroundColor).opacity(0.1) : Color.clear)
        .onHover { hovering in
            isHovered = hovering
        }
    }
}

#Preview {
    SearchWindow()
}