import SwiftUI

@main
struct AI_MemoryApp: App {
    var body: some Scene {
        MenuBarExtra("AI Memory", systemImage: "brain") {
            ContentView()
                .frame(width: 320, height: 400)
        }
        .menuBarExtraStyle(.window)
    }
}