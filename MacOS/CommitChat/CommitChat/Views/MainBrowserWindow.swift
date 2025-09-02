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
    
    private let dataManager = AIMemoryDataManager.shared
    // Purely dynamic projects loaded from filesystem/conversations
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
    }
    
    private var sidebarView: some View {
        // Sidebar with project filters
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
                                    .background(Color(NSColor.controlBackgroundColor))
                                    .cornerRadius(8)
                            }
                        }
                    } icon: {
                        Image(systemName: project == "All Projects" ? "tray.2" : "folder")
                            .foregroundColor(project == "All Projects" ? .accentColor : .secondary)
                    }
                    .tag(project)
                }
            }
            
            Section("Quick Filters") {
                Label("Recent", systemImage: "clock")
                Label("Has Code", systemImage: "chevron.left.forwardslash.chevron.right")
                Label("Has Errors", systemImage: "exclamationmark.triangle")
                Label("Starred", systemImage: "star")
            }
        }
        .listStyle(SidebarListStyle())
        .frame(minWidth: 200)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: {}) {
                    Image(systemName: "plus")
                }
            }
        }
    }
    
    private var contentView: some View {
        Text("Content View - TODO: Move full content here")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    private var detailView: some View {
        Text("Detail View - TODO: Move detail content here") 
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
                    }
                    .padding(8)
                    .background(Color(NSColor.controlBackgroundColor))
                    .cornerRadius(8)
                    .frame(maxWidth: 300)
                    
                    Spacer()
                    
                    HStack(spacing: 4) {
                        Button(action: {}) {
                            Image(systemName: "square.grid.2x2")
                        }
                        .buttonStyle(.accessoryBar)
                        
                        Button(action: {}) {
                            Image(systemName: "list.bullet")
                        }
                        .buttonStyle(.accessoryBar)
                    }
                }
                .padding()
                
                Divider()
                
                // Conversation grid
                ScrollView {
                    if isLoadingConversations {
                        VStack {
                            ProgressView("Loading conversations...")
                                .padding(50)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if let error = conversationError {
                        VStack(spacing: 16) {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.largeTitle)
                                .foregroundColor(.orange)
                            
                            Text("Failed to load conversations")
                                .font(.headline)
                            
                            Text(error.localizedDescription)
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
                            Image(systemName: "tray")
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
        } detail: {
            // Detail view when conversation is selected
            if let conversation = selectedConversation {
                ConversationDetailView(item: conversation)
            } else {
                ContentUnavailableView {
                    Label("Select a Conversation", systemImage: "bubble.left.and.bubble.right")
                } description: {
                    Text("Choose a conversation from the list to view details")
                }
            }
        }
        .frame(minWidth: 900, minHeight: 600)
        .onAppear {
            print("🔍 DEBUG: MainBrowserWindow.onAppear - loading projects and conversations")
            loadAvailableProjectsFromFileSystem()
            loadRecentConversations()
        }
        .onChange(of: selectedProject) { _, _ in
            filterConversations()
        }
        .onChange(of: searchText) { _, _ in
            filterConversations()
        }
    }
    
    // MARK: - Computed Properties
    
    var filteredConversations: [ConversationItem] {
        print("🔍 DEBUG: filteredConversations called - recentConversations.count = \(recentConversations.count)")
        var result = recentConversations
        
        // Filter by project
        if let project = selectedProject, project != "All Projects" {
            result = result.filter { $0.project.lowercased().contains(project.lowercased()) }
            print("🔍 DEBUG: After project filter ('\(project)'), result.count = \(result.count)")
        }
        
        // Filter by search text
        if !searchText.isEmpty {
            result = result.filter { 
                $0.title.localizedCaseInsensitiveContains(searchText) ||
                $0.project.localizedCaseInsensitiveContains(searchText)
            }
            print("🔍 DEBUG: After search filter ('\(searchText)'), result.count = \(result.count)")
        }
        
        print("🔍 DEBUG: Returning \(result.count) filtered conversations")
        return result
    }
    
    // MARK: - Methods
    
    private func loadRecentConversations() {
        print("🔍 DEBUG: MainBrowserWindow.loadRecentConversations() called")
        isLoadingConversations = true
        conversationError = nil
        
        Task {
            do {
                // Use longer timeframe to discover all available projects
                let timeframe = selectedProject == nil ? "last month" : "last week"
                
                print("🔍 DEBUG: About to call dataManager.listRecentConversations(limit: 50, timeframe: \(timeframe))")
                
                let conversations = try await dataManager.listRecentConversations(
                    limit: 50,
                    timeframe: timeframe
                )
                
                print("🔍 DEBUG: Successfully received \(conversations.count) conversations")
                
                await MainActor.run {
                    self.recentConversations = conversations
                    self.isLoadingConversations = false
                    
                    // Update available projects from conversations (cached to avoid repeated computation)
                    self.updateAvailableProjects(from: conversations)
                    
                    // Update global conversation count
                    appState.conversationCount = conversations.count
                    print("🔍 DEBUG: UI updated with \(conversations.count) conversations")
                }
            } catch let error as AIMemoryError {
                print("🔍 DEBUG: AIMemoryError caught: \(error)")
                await MainActor.run {
                    self.conversationError = error.localizedDescription
                    self.isLoadingConversations = false
                }
            } catch {
                print("🔍 DEBUG: Generic error caught: \(error)")
                await MainActor.run {
                    self.conversationError = error.localizedDescription
                    self.isLoadingConversations = false
                }
            }
        }
    }
    
    private func loadAvailableProjectsFromFileSystem() {
        print("🔍 DEBUG: Loading projects from ~/.claude/projects filesystem")
        
        Task {
            do {
                let homeURL = FileManager.default.homeDirectoryForCurrentUser
                let claudeProjectsURL = homeURL.appendingPathComponent(".claude/projects")
                
                let projectDirs = try FileManager.default.contentsOfDirectory(at: claudeProjectsURL, includingPropertiesForKeys: nil)
                
                var projectNames = Set<String>()
                projectNames.insert("All Projects")
                
                for projectDir in projectDirs {
                    let dirName = projectDir.lastPathComponent
                    if dirName.hasPrefix("-Users-harrison-Documents-Github-") {
                        let projectName = String(dirName.dropFirst("-Users-harrison-Documents-Github-".count))
                        projectNames.insert(projectName)
                    } else if !dirName.starts(with: ".") {
                        projectNames.insert(dirName)
                    }
                }
                
                let sortedProjects = Array(projectNames.subtracting(["All Projects"])).sorted()
                
                await MainActor.run {
                    self.availableProjects = ["All Projects"] + sortedProjects
                    print("🔍 DEBUG: Loaded projects from filesystem: \(self.availableProjects)")
                }
                
            } catch {
                print("🔍 DEBUG: Failed to load projects from filesystem: \(error)")
                // Keep default ["All Projects"] if filesystem read fails
            }
        }
    }
    
    private func updateAvailableProjects(from conversations: [ConversationItem]) {
        var projectSet = Set<String>(availableProjects) // Start with filesystem projects
        
        for conversation in conversations {
            projectSet.insert(conversation.project)
        }
        
        let sortedProjects = Array(projectSet.subtracting(["All Projects"])).sorted()
        self.availableProjects = ["All Projects"] + sortedProjects
        
        print("🔍 DEBUG: Updated available projects from conversations: \(self.availableProjects)")
    }
    
    private func filterConversations() {
        // Filtering is handled by the computed property
        // This method can be used for additional side effects if needed
    }
}

struct ConversationCard: View {
    let item: ConversationItem
    let isSelected: Bool
    @State private var isHovered = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Circle()
                    .fill(Color.accentColor.opacity(0.2))
                    .frame(width: 40, height: 40)
                    .overlay(
                        Text(String(item.title.prefix(1)).uppercased())
                            .font(.system(.headline, design: .rounded))
                            .foregroundColor(.accentColor)
                    )
                
                Spacer()
                
                if item.hasErrors {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundColor(.red)
                }
                
                Menu {
                    Button("Open in Claude") {}
                    Button("Copy Link") {}
                    Divider()
                    Button("Star") {}
                    Button("Archive") {}
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .foregroundColor(.secondary)
                }
                .menuStyle(.borderlessButton)
            }
            
            Text(item.title)
                .font(.headline)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            
            Text(item.project)
                .font(.caption)
                .foregroundColor(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color(NSColor.controlBackgroundColor))
                .cornerRadius(6)
            
            Spacer()
            
            HStack {
                Label("\(item.messageCount)", systemImage: "message")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Spacer()
                
                Text(item.date, style: .relative)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .frame(height: 180)
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 2)
        )
        .shadow(color: isHovered ? .black.opacity(0.1) : .clear, radius: 8)
        .scaleEffect(isHovered ? 1.02 : 1.0)
        .animation(.easeInOut(duration: 0.2), value: isHovered)
        .onHover { hovering in
            isHovered = hovering
        }
    }
}

struct ConversationDetailView: View {
    let item: ConversationItem
    @State private var conversationContent: ConversationContext?
    @State private var isLoadingContent = false
    @State private var loadError: String?
    
    private let mcpClient = MCPClient.shared
    private let dataManager = AIMemoryDataManager.shared
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(item.title)
                    .font(.largeTitle)
                    .bold()
                
                HStack {
                    Label(item.project, systemImage: "folder")
                    Label("\(item.messageCount) messages", systemImage: "message")
                    if let content = conversationContent {
                        Label("\(content.totalMessages) total", systemImage: "number")
                    }
                }
                .foregroundColor(.secondary)
                
                Divider()
                
                Text("Conversation Preview")
                    .font(.headline)
                
                if isLoadingContent {
                    HStack {
                        ProgressView()
                        Text("Loading conversation...")
                    }
                    .padding()
                } else if let error = loadError {
                    VStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle")
                            .foregroundColor(.orange)
                        Text("Failed to load conversation")
                            .font(.headline)
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                } else if let content = conversationContent {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(content.messages.prefix(10).enumerated()), id: \.offset) { index, message in
                            MessageBubble(role: message.role, content: String(message.content.prefix(200)) + (message.content.count > 200 ? "..." : ""))
                        }
                        if content.messages.count > 10 {
                            Text("... and \(content.messages.count - 10) more messages")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .padding(.top)
                        }
                    }
                } else {
                    Text("No conversation content available")
                        .foregroundColor(.secondary)
                        .padding()
                }
                
                Spacer()
            }
            .padding()
        }
        .frame(minWidth: 400)
        .onAppear {
            loadConversationContent()
        }
        .onChange(of: item.id) { _, _ in
            loadConversationContent()
        }
    }
    
    private func loadConversationContent() {
        // Extract session ID - we need to get it from the item
        // For now, let's add a property to ConversationItem to store the sessionId
        print("🔍 DEBUG: ConversationDetailView.loadConversationContent() called for item: \(item.title)")
        
        isLoadingContent = true
        loadError = nil
        conversationContent = nil
        
        Task {
            do {
                // Use the actual sessionId from the conversation item
                let sessionId = item.sessionId
                
                let manager = dataManager
                let content = try await manager.getConversationContext(
                    sessionId: sessionId,
                    page: 1,
                    pageSize: 50
                )
                
                await MainActor.run {
                    self.conversationContent = content
                    self.isLoadingContent = false
                }
            } catch {
                await MainActor.run {
                    self.loadError = error.localizedDescription
                    self.isLoadingContent = false
                }
            }
        }
    }
}

struct MessageBubble: View {
    let role: String
    let content: String
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: role == "User" ? "person.circle" : "cpu")
                .font(.title2)
                .foregroundColor(role == "User" ? .blue : .green)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(role)
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(content)
                    .font(.body)
            }
            
            Spacer()
        }
        .padding()
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(8)
    }
}

#Preview {
    MainBrowserWindow()
}