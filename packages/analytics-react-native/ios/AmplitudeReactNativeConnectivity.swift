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

    private var pathMonitor: NWPathMonitor?

    deinit {
        stopMonitoring()
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
        // hasListeners is read by the pathUpdateHandler on monitorQueue, so write
        // it there too; otherwise a queued update could read a stale value and
        // emit after teardown.
        monitorQueue.async { self.hasListeners = true }
        startMonitoring()
    }

    override func stopObserving() {
        monitorQueue.async { self.hasListeners = false }
        stopMonitoring()
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

    // MARK: Monitoring

    private func startMonitoring() {
        // Replace any existing monitor so repeated startObserving calls don't leak.
        stopMonitoring()
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            self?.emitConnectivityChange(path.status == .satisfied)
        }
        monitor.start(queue: monitorQueue)
        pathMonitor = monitor
    }

    private func stopMonitoring() {
        pathMonitor?.cancel()
        pathMonitor = nil
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
