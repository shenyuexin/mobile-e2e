import XCTest

final class OwnedRunnerUITests: XCTestCase {
  private let app = XCUIApplication()

  private func launchTargetApplicationIfNeeded() -> XCUIApplication? {
    guard let targetBundleId = ProcessInfo.processInfo.environment["IOS_OWNED_RUNNER_TARGET_BUNDLE_ID"], !targetBundleId.isEmpty else {
      return nil
    }
    let targetApp = XCUIApplication(bundleIdentifier: targetBundleId)
    if targetApp.state == .runningForeground {
      return targetApp
    }
    if targetApp.state == .runningBackground {
      targetApp.activate()
      if targetApp.wait(for: .runningForeground, timeout: 5) {
        return targetApp
      }
    }
    targetApp.launch()
    _ = targetApp.wait(for: .runningForeground, timeout: 10)
    return targetApp
  }

  private func editableCandidates(in targetApp: XCUIApplication) -> [XCUIElement] {
    let textFields = targetApp.textFields.allElementsBoundByIndex
    let secureTextFields = targetApp.secureTextFields.allElementsBoundByIndex
    let textViews = targetApp.textViews.allElementsBoundByIndex
    return textFields + secureTextFields + textViews
  }

  private func hasVisibleKeyboard(in targetApp: XCUIApplication) -> Bool {
    return targetApp.keyboards.firstMatch.exists || app.keyboards.firstMatch.exists
  }

  private func bestEditableElement(in targetApp: XCUIApplication) -> XCUIElement? {
    let candidates = editableCandidates(in: targetApp).filter { $0.exists && $0.isEnabled }
    if let hittable = candidates.first(where: { $0.isHittable }) {
      return hittable
    }
    if let first = candidates.first {
      return first
    }
    return nil
  }

  override func setUpWithError() throws {
    continueAfterFailure = false
    app.launch()
  }

  func testOwnedRunnerExecutesActionFromEnvironment() throws {
    XCTAssertTrue(app.staticTexts["owned_runner_title"].waitForExistence(timeout: 5))

    let flowPath = ProcessInfo.processInfo.environment["IOS_OWNED_RUNNER_FLOW_PATH"]
    XCTAssertNotNil(flowPath, "IOS_OWNED_RUNNER_FLOW_PATH must be provided by runtime executor")

    let actionType = ProcessInfo.processInfo.environment["IOS_OWNED_RUNNER_ACTION_TYPE"]
    XCTAssertNotNil(actionType, "IOS_OWNED_RUNNER_ACTION_TYPE is required")

    if actionType == "tap" {
      guard let xText = ProcessInfo.processInfo.environment["IOS_OWNED_RUNNER_ACTION_X"],
            let yText = ProcessInfo.processInfo.environment["IOS_OWNED_RUNNER_ACTION_Y"],
            let x = Double(xText),
            let y = Double(yText) else {
        XCTFail("IOS_OWNED_RUNNER_ACTION_X/Y must be numeric when actionType=tap")
        return
      }

      if let targetApp = launchTargetApplicationIfNeeded() {
        let anchor = targetApp.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        let coordinate = anchor.withOffset(CGVector(dx: x, dy: y))
        coordinate.tap()
        return
      }

      let tapTarget = app.buttons["owned_runner_tap_target"]
      XCTAssertTrue(tapTarget.waitForExistence(timeout: 5))
      tapTarget.tap()
      XCTAssertEqual(app.staticTexts["owned_runner_status"].label, "tap_executed")
      return
    }

    if actionType == "type_text" {
      guard let value = ProcessInfo.processInfo.environment["IOS_OWNED_RUNNER_ACTION_TEXT"] else {
        XCTFail("IOS_OWNED_RUNNER_ACTION_TEXT is required when actionType=type_text")
        return
      }
      if value.isEmpty {
        XCTFail("IOS_OWNED_RUNNER_ACTION_TEXT must not be empty when actionType=type_text")
        return
      }
      if let targetApp = launchTargetApplicationIfNeeded() {
        if hasVisibleKeyboard(in: targetApp) {
          targetApp.typeText(value)
          return
        }
        guard let editable = bestEditableElement(in: targetApp) else {
          XCTFail("No editable element found in target app for actionType=type_text")
          return
        }
        editable.tap()
        XCTAssertTrue(hasVisibleKeyboard(in: targetApp), "Keyboard did not appear after focusing editable element")
        editable.typeText(value)
        return
      }

      let input = app.textFields["owned_runner_input"]
      XCTAssertTrue(input.waitForExistence(timeout: 5))
      input.tap()
      input.typeText(value)
      XCTAssertEqual(input.value as? String, value)
      return
    }

    XCTFail("Unsupported IOS_OWNED_RUNNER_ACTION_TYPE: \(actionType ?? "<nil>")")
  }
}
