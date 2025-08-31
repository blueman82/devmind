# AI Memory App - Xcode Project Structure

## Directory Structure (After Xcode Project Creation)
```
MacOS/
├── AI Memory.xcodeproj/
│   └── project.pbxproj
├── AI Memory/
│   ├── AI_MemoryApp.swift          # Main app entry point
│   ├── ContentView.swift           # Primary menu bar interface
│   ├── Info.plist                  # App configuration
│   ├── Assets.xcassets/           # Images and icons
│   │   └── AppIcon.appiconset/    # App icon from img/image.png
│   ├── Models/
│   │   ├── MCPModels.swift        # Data structures for MCP communication
│   │   ├── ConversationModel.swift # Conversation data models  
│   │   └── RestorePointModel.swift # Git restore point models
│   ├── Views/
│   │   ├── MenuBarViews/
│   │   │   ├── MenuBarDropdown.swift     # Main dropdown from mockup
│   │   │   ├── SearchInterface.swift     # Search conversations view
│   │   │   ├── RestorePointsList.swift   # Recent restore points
│   │   │   └── ProjectInsights.swift     # Project metrics view
│   │   ├── WindowViews/
│   │   │   ├── MainWindow.swift          # Full conversation browser
│   │   │   ├── ConversationCard.swift    # Individual conversation display
│   │   │   └── SidebarView.swift         # Project filters sidebar
│   │   ├── RestoreViews/
│   │   │   ├── RestoreInterface.swift    # Restore point selection
│   │   │   └── RestorePointRow.swift     # Individual restore point item
│   │   └── SettingsViews/
│   │       ├── SettingsWindow.swift      # Settings panel from mockup
│   │       └── SettingsSidebar.swift     # Settings navigation
│   ├── Services/
│   │   ├── MCPClient.swift               # Node.js MCP server communication
│   │   ├── ProcessManager.swift          # Spawn/manage Node processes
│   │   └── FileMonitor.swift            # Watch for file changes
│   └── Extensions/
│       ├── Color+Theme.swift            # App color palette
│       └── View+Extensions.swift        # SwiftUI helpers
├── AI Memory Tests/
│   └── AI_Memory_Tests.swift
└── AI Memory UITests/
    └── AI_Memory_UITests.swift
```

## Key Implementation Files

### 1. AI_MemoryApp.swift (Main Entry Point)
```swift
import SwiftUI

@main
struct AI_MemoryApp: App {
    var body: some Scene {
        MenuBarExtra("AI Memory", systemImage: "brain") {
            MenuBarDropdown()
        }
        .menuBarExtraStyle(.window)  // Use window style for complex UI
        
        #if DEBUG
        // Optional: Add settings window for development
        Settings {
            SettingsWindow()
        }
        #endif
    }
}
```

### 2. ContentView.swift → MenuBarDropdown.swift
Main interface matching the mockup design with:
- AI Memory status indicator
- Search conversations button  
- Recent restore points
- Project insights
- Settings access

### 3. MCPClient.swift
Communication layer with existing Node.js MCP server:
- Spawn Node.js process with MCP server
- JSON message passing
- Handle MCP tool responses
- Error handling and reconnection

## Assets Requirements

### App Icon Setup
1. Export `img/image.png` as multiple sizes:
   - 16x16, 32x32, 128x128, 256x256, 512x512, 1024x1024
2. Add to `Assets.xcassets/AppIcon.appiconset/`
3. Configure for menu bar display (16x16, 32x32 are key)

### Menu Bar Icon
- Create monochrome template version of logo
- 16x16 and 32x32 for Retina displays
- Follow Apple Human Interface Guidelines

## SwiftUI Architecture

### State Management
- `@State` for local view state
- `@StateObject` for MCP client
- `@Published` properties for data updates
- Combine framework for reactive updates

### Navigation Pattern
- Menu bar as primary entry point
- Sheet/popover presentations for detailed views
- Settings via separate window (macOS pattern)

## Integration Points

### With Existing MCP Server
- Start Node.js server process on app launch
- Monitor process health
- Pass through all existing MCP tool calls
- Handle authentication and security

### With File System
- Monitor Claude projects directory
- Real-time updates for new conversations
- File system permissions handling

### With Git Integration
- Leverage existing restore point system
- Visual representation of git history
- Safe restoration workflows

This structure provides a solid foundation for the native macOS interface while preserving all existing DevMind functionality.