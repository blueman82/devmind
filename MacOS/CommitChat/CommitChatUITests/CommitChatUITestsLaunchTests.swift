//
//  CommitChatUITestsLaunchTests.swift
//  CommitChatUITests
//
//  Created by Gary Harrison on 31/08/2025.
//

import XCTest

final class CommitChatUITestsLaunchTests: XCTestCase {
    override class var runsForEachTargetApplicationUIConfiguration: Bool {
        true
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testLaunch() throws {
        let app = XCUIApplication()
        app.launch()
        
        // Verify menu bar app launches (no dock icon due to LSUIElement)
        // Screenshot will show menu bar state
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Launch Screen"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
