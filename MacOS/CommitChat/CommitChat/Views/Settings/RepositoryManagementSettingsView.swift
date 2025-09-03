//
//  RepositoryManagementSettingsView.swift
//  CommitChat
//
//  Created on 2025-09-03.
//

import SwiftUI

/// Repository Management settings tab view for auto-commit configuration
struct RepositoryManagementSettingsView: View {
    @StateObject private var appState = AppState.shared
    @State private var showingFolderPicker = false
    @State private var selectedRepository: RepositoryConfig?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Repository Management")
                .font(.title)
                .bold()
            
            // Auto-commit service status
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Toggle("Enable Auto-Commit Service", isOn: $appState.autoCommitEnabled)
                            .onChange(of: appState.autoCommitEnabled) { oldValue, newValue in
                                Task {
                                    if newValue {
                                        _ = await appState.startAutoCommitService()
                                        await appState.syncRepositoriesWithService()
                                    } else {
                                        _ = await appState.stopAutoCommitService()
                                    }
                                }
                            }
                        
                        Spacer()
                        
                        // Status indicator
                        HStack {
                            Circle()
                                .fill(appState.autoCommitServiceConnected ? .green : .red)
                                .frame(width: 8, height: 8)
                            Text(appState.autoCommitServiceConnected ? "Connected" : "Disconnected")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    if appState.autoCommitEnabled {
                        HStack {
                            Toggle("Auto-detect repositories", isOn: $appState.autoDetectRepositories)
                            
                            Spacer()
                            
                            Button("Add Repository") {
                                showingFolderPicker = true
                            }
                            .buttonStyle(.bordered)
                            
                            Button("Scan for Repositories") {
                                Task {
                                    await appState.discoverRepositories()
                                }
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
                .padding(.vertical, 4)
            } label: {
                Label("Auto-Commit Service", systemImage: "gearshape.2")
            }
            
            // Statistics dashboard
            if appState.autoCommitEnabled {
                GroupBox {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            VStack(alignment: .leading) {
                                Text("\(appState.totalAutoCommits)")
                                    .font(.title2)
                                    .bold()
                                Text("Total Commits")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            
                            Spacer()
                            
                            VStack(alignment: .trailing) {
                                Text("\(appState.monitoredRepositories.count)")
                                    .font(.title2)
                                    .bold()
                                Text("Monitored Repos")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        
                        if appState.monitoredRepositories.isEmpty {
                            Text("No repositories configured. Add repositories above to begin auto-commit monitoring.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .padding(.top, 8)
                        }
                    }
                    .padding(.vertical, 4)
                } label: {
                    Label("Statistics", systemImage: "chart.bar")
                }
                
                // Repository list
                GroupBox {
                    VStack(alignment: .leading, spacing: 8) {
                        if appState.monitoredRepositories.isEmpty {
                            Text("No repositories monitored")
                                .foregroundColor(.secondary)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding()
                        } else {
                            ForEach(appState.monitoredRepositories) { repo in
                                RepositoryRow(
                                    repository: repo,
                                    onToggleEnabled: { toggleRepository(repo) },
                                    onShowSettings: { selectedRepository = repo }
                                )
                                
                                if repo.id != appState.monitoredRepositories.last?.id {
                                    Divider()
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                } label: {
                    Label("Monitored Repositories", systemImage: "folder.badge.gearshape")
                }
            }
        }
        .fileImporter(
            isPresented: $showingFolderPicker,
            allowedContentTypes: [.folder],
            allowsMultipleSelection: false
        ) { result in
            handleFolderSelection(result)
        }
        .sheet(item: $selectedRepository) { repo in
            RepositorySettingsSheet(repository: binding(for: repo))
        }
    }
    
    // MARK: - Helper Methods
    
    private func toggleRepository(_ repository: RepositoryConfig) {
        if let index = appState.monitoredRepositories.firstIndex(where: { $0.id == repository.id }) {
            appState.monitoredRepositories[index].isEnabled.toggle()
        }
    }
    
    private func binding(for repository: RepositoryConfig) -> Binding<RepositoryConfig> {
        guard let index = appState.monitoredRepositories.firstIndex(where: { $0.id == repository.id }) else {
            return .constant(repository)
        }
        return $appState.monitoredRepositories[index]
    }
    
    private func handleFolderSelection(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            
            let newRepo = RepositoryConfig(path: url.path, isAutoDetected: false)
            
            if !appState.monitoredRepositories.contains(where: { $0.path == newRepo.path }) {
                appState.monitoredRepositories.append(newRepo)
            }
            
        case .failure(let error):
            print("Error selecting folder: \(error)")
        }
    }
}

// MARK: - Repository Row Component

struct RepositoryRow: View {
    let repository: RepositoryConfig
    let onToggleEnabled: () -> Void
    let onShowSettings: () -> Void
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(repository.displayName)
                        .font(.headline)
                    
                    if repository.isAutoDetected {
                        Text("Auto-detected")
                            .font(.caption)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.blue.opacity(0.2))
                            .foregroundColor(.blue)
                            .cornerRadius(4)
                    }
                    
                    Spacer()
                    
                    // Status indicator
                    Circle()
                        .fill(repository.connectionStatus.color == "green" ? .green : 
                              repository.connectionStatus.color == "red" ? .red : .gray)
                        .frame(width: 6, height: 6)
                }
                
                Text(repository.path)
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                HStack {
                    Text("Commits: \(repository.totalCommits)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    if let lastCommit = repository.lastCommitDate {
                        Text("• Last: \(lastCommit, formatter: relativeDateFormatter)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            
            Spacer()
            
            VStack {
                Toggle("", isOn: .constant(repository.isEnabled))
                    .labelsHidden()
                    .onChange(of: repository.isEnabled) {
                        onToggleEnabled()
                    }
                
                Button("Settings") {
                    onShowSettings()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Repository Settings Sheet

struct RepositorySettingsSheet: View {
    @Binding var repository: RepositoryConfig
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            Form {
                Section("Repository") {
                    LabeledContent("Path", value: repository.path)
                    LabeledContent("Display Name", value: repository.displayName)
                }
                
                Section("Auto-Commit Settings") {
                    HStack {
                        Text("Throttle (seconds)")
                        Spacer()
                        TextField("", value: $repository.throttleSeconds, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 80)
                    }
                    
                    HStack {
                        Text("Max file size (MB)")
                        Spacer()
                        TextField("", value: $repository.maxFileSizeMB, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 80)
                    }
                    
                    Picker("Notifications", selection: $repository.notificationPreference) {
                        ForEach(NotificationPreference.allCases, id: \.self) { preference in
                            Text(preference.displayName).tag(preference)
                        }
                    }
                }
                
                Section("Exclusion Patterns") {
                    ForEach(repository.excludedPatterns.indices, id: \.self) { index in
                        TextField("Pattern", text: $repository.excludedPatterns[index])
                    }
                    .onDelete { indexSet in
                        repository.excludedPatterns.remove(atOffsets: indexSet)
                    }
                    
                    Button("Add Pattern") {
                        repository.excludedPatterns.append("")
                    }
                }
            }
            .navigationTitle("Repository Settings")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .frame(minWidth: 500, minHeight: 400)
    }
}

// MARK: - Formatters

private let relativeDateFormatter: RelativeDateTimeFormatter = {
    let formatter = RelativeDateTimeFormatter()
    formatter.dateTimeStyle = .named
    return formatter
}()

#Preview {
    RepositoryManagementSettingsView()
}