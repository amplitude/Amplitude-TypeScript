import Foundation
import React
import Network

/// Connectivity-only native module bridged back to JS as
/// `AmplitudeReactNativeConnectivity`. Monitors connectivity with `NWPathMonitor`.
@objc(AmplitudeReactNativeConnectivity)
class AmplitudeReactNativeConnectivity: RCTEventEmitter {

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

    override func supportedEvents() -> [String]! {
        return [AmplitudeReactNativeConnectivity.connectivityEventName]
    }

    @objc
    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    override func startObserving() {
        monitorQueue.sync {
            hasListeners = true
            pathMonitor.start(queue: monitorQueue)
        }
    }

    override func stopObserving() {
        // Don't cancel here — a cancelled NWPathMonitor can't be restarted; cancel only in deinit.
        monitorQueue.sync {
            hasListeners = false
        }
    }

    // MARK: Exported methods

    /// Always seed connected because `NWPathMonitor` delivers the current path
    /// as its first update once JS subscribes
    @objc
    func getNetworkConnectivityStatus(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) -> Void {
        resolve(["isConnected": true])
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
