//
//  CommitChatApp.swift
//  CommitChat
//
//  Created by Gary Harrison on 31/08/2025.
//

import SwiftUI

@main
struct CommitChatApp: App {
    var body: some Scene {
        MenuBarExtra("AI Memory", systemImage: "brain") {
            ContentView()
                .frame(width: 320, height: 400)
        }
        .menuBarExtraStyle(.window)
    }
}
