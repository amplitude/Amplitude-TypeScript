import XCTest
import React
import amplitude_react_native

private struct CapturedEvent {
    let name: String
    let body: Any?
}

/// Captures emitted events instead of bridging them to JS; the tests run
/// without a live `RCTBridge`.
private final class EventCapturingConnectivity: AmplitudeReactNativeConnectivity {

    // Guards both fields: events are emitted from the module's monitor
    // queue while tests read and swap the handler from the main thread.
    private let lock = NSLock()
    private var capturedEvents: [CapturedEvent] = []
    private var handler: ((CapturedEvent) -> Void)?

    var events: [CapturedEvent] {
        lock.lock()
        defer { lock.unlock() }
        return capturedEvents
    }

    func setHandler(_ handler: ((CapturedEvent) -> Void)?) {
        lock.lock()
        defer { lock.unlock() }
        self.handler = handler
    }

    override func sendEvent(withName name: String!, body: Any!) {
        let event = CapturedEvent(name: name ?? "", body: body)
        lock.lock()
        capturedEvents.append(event)
        let handler = self.handler
        lock.unlock()
        handler?(event)
    }
}

final class AmplitudeConnectivityTests: XCTestCase {

    private var module: EventCapturingConnectivity!

    override func setUp() {
        super.setUp()
        module = EventCapturingConnectivity()
    }

    override func tearDown() {
        module.setHandler(nil)
        module.stopObserving()
        module = nil
        super.tearDown()
    }

    func testSupportedEvents() {
        XCTAssertEqual(module.supportedEvents(), ["AmplitudeNetworkConnectivityChanged"])
    }

    func testSeedResolvesConnected() {
        let resolved = expectation(description: "promise resolved")
        module.getNetworkConnectivityStatus(
            { value in
                XCTAssertEqual((value as? [String: Bool])?["isConnected"], true)
                resolved.fulfill()
            },
            rejecter: { _, _, _ in
                XCTFail("getNetworkConnectivityStatus must not reject")
            }
        )
        wait(for: [resolved], timeout: 1)
    }

    /// The optimistic `{isConnected: true}` seed in
    /// `getNetworkConnectivityStatus` relies on `NWPathMonitor` delivering
    /// the current path as its first update once monitoring starts. CI
    /// simulators always have network, so that update must report connected.
    func testEmitsInitialPathUpdateAfterStartObserving() {
        let received = expectation(description: "initial connectivity event")
        received.assertForOverFulfill = false
        module.setHandler { event in
            XCTAssertEqual(event.name, "AmplitudeNetworkConnectivityChanged")
            XCTAssertEqual((event.body as? [String: Bool])?["isConnected"], true)
            received.fulfill()
        }
        module.startObserving()
        wait(for: [received], timeout: 10)
    }

    func testNoEventsAfterStopObserving() {
        let received = expectation(description: "initial connectivity event")
        received.assertForOverFulfill = false
        module.setHandler { _ in received.fulfill() }
        module.startObserving()
        wait(for: [received], timeout: 10)

        module.stopObserving()
        module.setHandler(nil)
        // Let any update already in flight on the monitor queue drain before
        // asserting silence.
        Thread.sleep(forTimeInterval: 0.5)
        let countAfterStop = module.events.count

        let quiet = expectation(description: "no events after stopObserving")
        quiet.isInverted = true
        module.setHandler { _ in quiet.fulfill() }
        wait(for: [quiet], timeout: 2)
        XCTAssertEqual(module.events.count, countAfterStop)
    }
}
