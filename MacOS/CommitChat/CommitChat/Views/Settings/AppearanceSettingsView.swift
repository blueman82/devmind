//
//  AppearanceSettingsView.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI

/// Appearance and theme settings tab
struct AppearanceSettingsView: View {
    @AppStorage("colorScheme") private var colorScheme = "Auto"
    @AppStorage("accentColor") private var accentColor = "Blue"
    @AppStorage("fontSize") private var fontSize = "Medium"
    
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Appearance")
                .font(.title)
                .bold()
            
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Theme:")
                        Picker("", selection: $colorScheme) {
                            Text("Auto").tag("Auto")
                            Text("Light").tag("Light")
                            Text("Dark").tag("Dark")
                        }
                        .pickerStyle(SegmentedPickerStyle())
                        .frame(width: 200)
                    }
                    
                    HStack {
                        Text("Accent Color:")
                        Picker("", selection: $accentColor) {
                            Text("Blue").tag("Blue")
                            Text("Purple").tag("Purple")
                            Text("Pink").tag("Pink")
                            Text("Red").tag("Red")
                            Text("Orange").tag("Orange")
                            Text("Green").tag("Green")
                        }
                        .pickerStyle(MenuPickerStyle())
                        .frame(width: 150)
                    }
                    
                    HStack {
                        Text("Font Size:")
                        Picker("", selection: $fontSize) {
                            Text("Small").tag("Small")
                            Text("Medium").tag("Medium")
                            Text("Large").tag("Large")
                        }
                        .pickerStyle(SegmentedPickerStyle())
                        .frame(width: 200)
                    }
                }
                .padding(.vertical, 4)
            } label: {
                Label("Theme", systemImage: "paintbrush")
            }
        }
    }
}