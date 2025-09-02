//
//  MainBrowserWindow.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI

struct MainBrowserWindow: View {
    @StateObject private var appState = AppState()
    @State private var selectedProject: String? = nil
    @State private var searchText = ""
    @State private var selectedConversation: ConversationItem?
    @State private var recentConversations: [ConversationItem] = []
    @State private var isLoadingConversations = false
    @State private var conversationError: String?
    
    private let dataManager = AIMemoryDataManagerFixed.shared
    @State private var availableProjects: [String] = ["All Projects"]
    
    private var projects: [String] {
        return availableProjects
    }
    
    var body: some View {
        NavigationSplitView {
            sidebarView
        } content: {
            contentView
        } detail: {
            detailView
        }
        .onAppear {
            loadRecentConversations()
        }
        .onChange(of: selectedProject) { _, _ in
            filterConversations()
        }
        .onChange(of: searchText) { _, _ in
            filterConversations()
        }
    }
    
    private var sidebarView: some View {
        List(selection: $selectedProject) {
            Section("Projects") {
                ForEach(projects, id: \.self) { project in
                    Label {
                        HStack {
                            Text(project)
                            Spacer()
                            if project != "All Projects" {
                                Text("\(Int.random(in: 5...50))")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Color.secondary.opacity(0.2))
                                    .clipShape(Capsule())
                            }
                        }
                    } icon: {
                        Image(systemName: project == "All Projects" ? "folder.fill" : "folder")
                            .foregroundColor(.blue)
                    }
                    .tag(project)
                }
            }
        }
        .listStyle(SidebarListStyle())
        .navigationTitle("Projects")
    }
    
    private var contentView: some View {
        VStack(spacing: 0) {
            // Search bar
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                
                TextField("Search conversations...", text: $searchText)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                
                if !searchText.isEmpty {
                    Button(action: { searchText = "" }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.secondary)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            .padding()
            
            // Main content area
            if isLoadingConversations {
                VStack {
                    ProgressView()
                        .scaleEffect(1.2)
                    
                    Text("Loading conversations...")
                        .font(.headline)
                        .padding(.top)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = conversationError {
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle)
                        .foregroundColor(.red)
                    
                    Text("Error Loading Conversations")
                        .font(.headline)
                    
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                    
                    Button("Retry") {
                        loadRecentConversations()
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding(50)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if filteredConversations.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: "message")
                        .font(.largeTitle)
                        .foregroundColor(.secondary)
                    
                    Text("No conversations found")
                        .font(.headline)
                    
                    Text("Start a new conversation in Claude Code to see it here")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Button("Refresh") {
                        loadRecentConversations()
                    }
                }
                .padding(50)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVGrid(columns: [
                        GridItem(.adaptive(minimum: 280, maximum: 350), spacing: 16)
                    ], spacing: 16) {
                        ForEach(filteredConversations) { item in
                            ConversationCard(item: item, isSelected: selectedConversation?.id == item.id)
                                .onTapGesture {
                                    selectedConversation = item
                                }
                        }
                    }
                    .padding()
                }
            }
            
            // Status bar
            HStack {
                Text("\(filteredConversations.count) conversations")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Spacer()
                
                Circle()
                    .fill(dataManager.isInitialized ? Color.green : Color.red)
                    .frame(width: 6, height: 6)
                
                Text(dataManager.isInitialized ? "Database Ready" : "Initializing...")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(Color(NSColor.controlBackgroundColor))
        }
        .navigationTitle("Conversations")
    }
    
@ViewBuilder
    private var detailView: some View {
        if let conversation = selectedConversation {
            ConversationDetailView(conversation: conversation)
        } else {
            VStack {
                Image(systemName: "message.badge")
                    .font(.largeTitle)
                    .foregroundColor(.secondary)
                
                Text("Select a conversation")
                    .font(.headline)
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
    
    var filteredConversations: [ConversationItem] {
        var result = recentConversations
        
        // Filter by project
        if let project = selectedProject, project != "All Projects" {
            result = result.filter { $0.project.lowercased().contains(project.lowercased()) }
        }
        
        // Filter by search text
        if !searchText.isEmpty {
            result = result.filter { 
                $0.title.localizedCaseInsensitiveContains(searchText) ||
                $0.project.localizedCaseInsensitiveContains(searchText)
            }
        }
        
        return result
    }
    
    private func loadRecentConversations() {
        isLoadingConversations = true
        conversationError = nil
        
        Task {
            do {
                let timeframe = selectedProject == nil ? "last month" : "last week"
                
                let conversations = try await dataManager.listRecentConversations(
                    limit: 50,
                    timeframe: timeframe
                )
                
                await MainActor.run {
                    self.recentConversations = conversations
                    self.isLoadingConversations = false
                    
                    self.updateAvailableProjects(from: conversations)
                    appState.conversationCount = conversations.count
                }
            } catch let error as AIMemoryError {
                await MainActor.run {
                    self.conversationError = error.localizedDescription
                    self.isLoadingConversations = false
                }
            } catch {
                await MainActor.run {
                    self.conversationError = error.localizedDescription
                    self.isLoadingConversations = false
                }
            }
        }
    }
    
    private func filterConversations() {
        // This method is called when filters change to trigger UI updates
        // The actual filtering is done in the computed property
    }
    
    private func updateAvailableProjects(from conversations: [ConversationItem]) {
        var projectSet = Set<String>(availableProjects)
        
        for conversation in conversations {
            if !conversation.project.isEmpty {
                projectSet.insert(conversation.project)
            }
        }
        
        let sortedProjects = projectSet.filter { $0 != "All Projects" }.sorted()
        self.availableProjects = ["All Projects"] + sortedProjects
    }
}

// MARK: - Supporting Views

struct ConversationCard: View {
    let item: ConversationItem
    let isSelected: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(item.title)
                    .font(.headline)
                    .lineLimit(2)
                
                Spacer()
                
                Text(item.project)
                    .font(.caption)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.blue.opacity(0.2))
                    .clipShape(Capsule())
            }
            
            Text("Last updated: \(item.date.formatted(.dateTime))")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .lineLimit(3)
            
            Spacer()
            
            HStack {
                Text(item.date.formatted(.dateTime))
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Spacer()
                
                Text("\(item.messageCount) messages")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .frame(height: 120)
        .background(isSelected ? Color.blue.opacity(0.1) : Color(NSColor.controlBackgroundColor))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(isSelected ? Color.blue : Color.clear, lineWidth: 2)
        )
    }
}

struct ConversationDetailView: View {
    let conversation: ConversationItem
    private let dataManager = AIMemoryDataManagerFixed.shared
    
    var body: some View {
        VStack {
            Text("Conversation Detail - TODO: Restore full implementation")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .navigationTitle(conversation.title)
    }
}

struct MessageBubble: View {
    let role: String
    let content: String
    
    var body: some View {
        Text("Message Bubble - TODO: Restore full implementation")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}