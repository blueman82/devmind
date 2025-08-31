# AI Memory macOS App Setup Instructions

## Prerequisites Required

### 1. Install Xcode from Mac App Store
- Open Mac App Store
- Search for "Xcode" 
- Install (this is a large download, ~10GB+)
- Launch Xcode once installed to accept license agreements

### 2. Verify Installation
After Xcode installation, run:
```bash
xcode-select --install  # If needed
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
xcodebuild -version     # Should show Xcode version
```

## Project Structure to Create

### 1. Xcode Project Setup
1. Open Xcode
2. Create new project: **File → New → Project**
3. Select **macOS** → **App**
4. Configure project:
   - Product Name: `AI Memory`
   - Bundle Identifier: `com.devmind.aimemory` 
   - Language: **Swift**
   - Interface: **SwiftUI**
   - Use Core Data: **No**
   - Include Tests: **Yes**

### 2. Menu Bar App Configuration
In the project settings, modify `Info.plist`:
```xml
<key>LSUIElement</key>
<true/>
```

This makes the app a menu bar only application (no dock icon).

### 3. Initial SwiftUI Structure
Based on the Context7 documentation, we'll use:
- `MenuBarExtra` for the menu bar presence
- SwiftUI views for the interfaces shown in mockups
- Process communication to connect to existing MCP server

## Next Steps After Xcode Installation
1. Create the Xcode project as described above
2. Set up basic menu bar application structure
3. Implement UI components from mockups
4. Add MCP client integration layer

## Files to Create in Xcode Project
- `ContentView.swift` - Main menu bar dropdown interface
- `MenuBarApp.swift` - App entry point with MenuBarExtra
- `MCPClient.swift` - Communication layer with Node.js MCP server
- `Models/` directory for data structures
- `Views/` directory for UI components

## Integration with Existing Backend
The Swift app will communicate with the existing Node.js MCP server via:
- Process spawning and IPC
- File system monitoring
- JSON message passing

This approach leverages all existing functionality while providing native macOS UI.