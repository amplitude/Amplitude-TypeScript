import Foundation
import React
import Network

/// Connectivity-only native module bridged back to JS as
/// `AmplitudeReactNativeConnectivity`. Monitors connectivity with `NWPathMonitor`.
///
/// `open` so the XCTest suite in `ios/Tests` can subclass it and capture
/// events without a live `RCTBridge`.
@objc(AmplitudeReactNativeConnectivity)
open class AmplitudeReactNativeConnectivity: RCTEventEmitter {

    private static let connectivityEventName = "AmplitudeNetworkConnectivityChanged"

    private var hasListeners = false
    private let monitorQueue = DispatchQueue(label: "com.amplitude.reactnative.connectivity")

    private let pathMonitor = NWPathMonitor()

    override init() {
        super.init()
        pathMonitor.pathUpdateHandler = { [weak self] path in
            self?.emitConnectivityChange(path.status == .satisfied)
        }
    }

    deinit {
        pathMonitor.cancel()
    }

    // MARK: RCTEventEmitter

    open override func supportedEvents() -> [String]! {
        return [AmplitudeReactNativeConnectivity.connectivityEventName]
    }

    @objc
    public override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    open override func startObserving() {
        // Set the listener flag and start the monitor atomically on monitorQueue,
        // where the pathUpdateHandler reads the flag. sync (not async) so the flag
        // is set before the monitor's first update fires.
        monitorQueue.sync {
            hasListeners = true
            pathMonitor.start(queue: monitorQueue)
        }
    }

    open override func stopObserving() {
        monitorQueue.sync {
            hasListeners = false
        }
    }

    // MARK: Exported methods

    /// Seed disconnected so startup events buffer (offline) until the monitor's
    /// first update — delivered once JS subscribes and start() runs — reports the
    /// real status. Seeding connected would risk sending startup events while
    /// actually offline.
    @objc
    public func getNetworkConnectivityStatus(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) -> Void {
        resolve(["isConnected": false])
    }

    // MARK: Helpers

    private func emitConnectivityChange(_ connected: Bool) {
        guard hasListeners else { return }
        sendEvent(
            withName: AmplitudeReactNativeConnectivity.connectivityEventName,
            body: ["isConnected": connected]
        )
    }
}
