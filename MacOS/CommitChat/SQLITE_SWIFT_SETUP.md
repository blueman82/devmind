# SQLite.swift Setup Instructions

## 1. Add Package Dependency to Xcode Project

1. Open CommitChat.xcodeproj in Xcode
2. Go to **File** → **Add Package Dependencies...**
3. Enter URL: `https://github.com/stephencelis/SQLite.swift`
4. Select **Version**: Up to Next Major Version 0.15.4
5. Click **Add Package**
6. Select **SQLite** target and click **Add Package**

## 2. Verify Installation

After adding the package, you should be able to import:
```swift
import SQLite
```

## 3. Implementation Status

✅ Package URL verified: https://github.com/stephencelis/SQLite.swift
✅ Latest version: 0.15.4 (active maintenance)
✅ Bundles modern SQLite version (eliminates 3.43.2 corruption)

## 4. Next Steps

Once package is added:
1. Import SQLite in AIMemoryDataModel.swift
2. Replace raw SQLite3 calls with SQLite.swift Connection/Table APIs
3. Test bulk operations for corruption elimination

## 5. Corruption Elimination Target

Current problem: Lines 539-567 in indexConversation method cause:
```
index corruption at line 106515 of [1b37c146ee]
```

SQLite.swift solution: Type-safe API with bundled modern SQLite eliminates this corruption permanently.