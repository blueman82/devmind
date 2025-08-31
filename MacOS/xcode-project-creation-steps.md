# Step-by-Step Xcode Project Creation

## Phase 1: Install and Setup Xcode

### 1. Install Xcode (if not already installed)
```bash
# Check if Xcode is installed
ls /Applications/Xcode.app

# If not found, install from Mac App Store:
# - Open Mac App Store
# - Search "Xcode"
# - Click Install (free, ~10GB download)
```

### 2. Configure Xcode Command Line Tools
```bash
# Switch to Xcode developer tools
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer

# Verify installation
xcode-select --print-path
xcodebuild -version
```

## Phase 2: Create New Xcode Project

### 1. Launch Xcode and Create Project
1. Open Xcode application
2. Select "Create a new Xcode project"
3. Choose template:
   - **macOS** tab
   - **App** template
   - Click "Next"

### 2. Configure Project Settings
```
Product Name: AI Memory
Team: (your Apple ID)
Organization Identifier: com.devmind.aimemory
Bundle Identifier: com.devmind.aimemory
Language: Swift
Interface: SwiftUI
Use Core Data: [UNCHECKED]
Include Tests: [CHECKED]
```

### 3. Choose Location
- Navigate to: `/Users/harrison/Documents/Github/devmind/MacOS/`
- Click "Create"

## Phase 3: Configure for Menu Bar App

### 1. Modify Info.plist
1. In Xcode, select the project in navigator
2. Select "AI Memory" target
3. Go to "Info" tab
4. Add new property:
   - Key: `Application is agent (UIElement)` (or raw: `LSUIElement`)
   - Type: `Boolean`
   - Value: `YES` (checked)

### 2. Update App Entry Point
Replace contents of `AI_MemoryApp.swift`:

```swift
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
```

### 3. Create Initial ContentView
Replace contents of `ContentView.swift`:

```swift
import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                Image(systemName: "brain")
                    .foregroundColor(.blue)
                Text("AI Memory")
                    .font(.headline)
                Spacer()
                Circle()
                    .fill(.green)
                    .frame(width: 8, height: 8)
            }
            .padding(.horizontal)
            
            Divider()
            
            // Menu Items (matching mockup)
            VStack(alignment: .leading, spacing: 8) {
                MenuBarItem(icon: "magnifyingglass", title: "Search Conversations")
                MenuBarItem(icon: "bookmark", title: "Recent Restore Points")
                MenuBarItem(icon: "chart.bar", title: "Project Insights")
                MenuBarItem(icon: "gearshape", title: "Settings")
            }
            .padding(.horizontal)
            
            Spacer()
        }
        .padding(.vertical)
        .background(Color(NSColor.windowBackgroundColor))
    }
}

struct MenuBarItem: View {
    let icon: String
    let title: String
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .frame(width: 16)
                .foregroundColor(.secondary)
            Text(title)
                .font(.system(size: 14))
            Spacer()
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(Color.clear)
        .contentShape(Rectangle())
        .onTapGesture {
            print("Tapped: \\(title)")
        }
        .onHover { hovering in
            // Add hover effect later
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
```

## Phase 4: Add App Icon

### 1. Prepare Icon Assets
```bash
# Convert the existing logo to required sizes
# From /Users/harrison/Documents/Github/devmind/img/image.png
# Create: 16x16, 32x32, 128x128, 256x256, 512x512, 1024x1024
```

### 2. Add to Xcode
1. Open `Assets.xcassets` in Xcode
2. Select `AppIcon`
3. Drag and drop icon files to appropriate size slots
4. Focus on 16x16 and 32x32 for menu bar display

## Phase 5: Test Basic Functionality

### 1. Build and Run
1. Select "AI Memory" scheme
2. Click Run button (▶️) or press Cmd+R
3. App should appear in menu bar (no dock icon)
4. Click menu bar icon to see dropdown

### 2. Verify Menu Bar Behavior
- No dock icon should appear
- Menu bar extra should be clickable
- Dropdown should show basic interface
- App should quit properly

## Phase 6: Initial Commit

```bash
cd /Users/harrison/Documents/Github/devmind
git add MacOS/
git commit -m "✅ PHASE 8E: Initialize Swift macOS app Xcode project

- Created AI Memory.xcodeproj with SwiftUI
- Configured as menu bar only app (LSUIElement = true)  
- Basic MenuBarExtra implementation
- Initial ContentView matching UI mockups
- Ready for MCP client integration"
```

## Expected File Structure After Creation
```
MacOS/
├── AI Memory.xcodeproj/
├── AI Memory/
│   ├── AI_MemoryApp.swift
│   ├── ContentView.swift  
│   ├── Assets.xcassets/
│   └── Info.plist
├── AI Memory Tests/
└── AI Memory UITests/
```

## Next Steps After Project Creation
1. Implement MCP client communication layer
2. Add conversation search functionality
3. Integrate with existing restore point system
4. Enhance UI with full mockup designs
5. Add proper error handling and logging

Run these steps once Xcode is installed and ready!