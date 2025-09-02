//
//  SQLiteTest.swift
//  CommitChat
//
//  Created on 2025-09-02.
//  Simple test to verify SQLite.swift package import works
//

import Foundation

#if canImport(SQLite)
import SQLite
print("✅ SQLite.swift import successful!")
#else
print("❌ SQLite.swift import failed - module not available")
#endif

// Simple test class to verify SQLite.swift functionality
class SQLiteTest {
    static func testImport() {
        #if canImport(SQLite)
        print("✅ SQLite.swift is available")
        do {
            let db = try Connection(":memory:")
            print("✅ SQLite.swift Connection created successfully")
        } catch {
            print("❌ SQLite.swift Connection failed: \(error)")
        }
        #else
        print("❌ SQLite.swift module not available")
        #endif
    }
}