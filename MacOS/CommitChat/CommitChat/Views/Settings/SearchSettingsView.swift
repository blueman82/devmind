//
//  SearchSettingsView.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI

/// Search configuration settings tab
struct SearchSettingsView: View {
    @AppStorage("searchScope") private var searchScope = "All"
    @AppStorage("maxResults") private var maxResults = 50
    @AppStorage("includeArchived") private var includeArchived = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Search")
                .font(.title)
                .bold()
            
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Default Scope:")
                        Picker("", selection: $searchScope) {
                            Text("All Conversations").tag("All")
                            Text("Current Project").tag("Project")
                            Text("Last 30 Days").tag("Recent")
                        }
                        .pickerStyle(MenuPickerStyle())
                        .frame(width: 200)
                    }
                    
                    HStack {
                        Text("Max Results:")
                        Slider(value: .init(get: { Double(maxResults) }, set: { maxResults = Int($0) }), 
                               in: 10...200, step: 10)
                        Text("\(maxResults)")
                            .frame(width: 40)
                    }
                    
                    Toggle("Include archived conversations", isOn: $includeArchived)
                }
                .padding(.vertical, 4)
            } label: {
                Label("Search Options", systemImage: "magnifyingglass")
            }
        }
    }
}