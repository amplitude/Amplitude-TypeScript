import Foundation
import React
#if canImport(Network)
import Network
#endif

/// Connectivity-only native module bridged back to JS as
/// `AmplitudeReactNativeConnectivity`.
///
/// Monitors connectivity with `NWPathMonitor` (iOS/tvOS 12+). Below 12 detection is best-effort: the module never
/// reports offline.
@objc(AmplitudeReactNativeConnectivity)
class AmplitudeReactNativeConnectivity: RCTEventEmitter {

    private static let connectivityEventName = "AmplitudeNetworkConnectivityChanged"

    private var hasListeners = false
    private let monitorQueue = DispatchQueue(label: "com.amplitude.reactnative.connectivity")

    // NWPathMonitor; AnyObject because stored properties can't be @available-gated.
    private var pathMonitor: AnyObject?

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
        hasListeners = true
        startMonitoring()
    }

    override func stopObserving() {
        hasListeners = false
        stopMonitoring()
    }

    // MARK: Exported methods

    /// Always seed connected because `NWPathMonitor` delivers the current
    /// path as its first update once JS subscribes, correcting the seed within
    /// milliseconds.
    /// https://github.com/xybp888/iOS-SDKs/blob/master/iPhoneOS26.5.sdk/System/Library/Frameworks/Network.framework/Headers/path_monitor.h#L152-L153
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
        if #available(iOS 12, tvOS 12, *) {
            startPathMonitor()
        }
    }

    private func stopMonitoring() {
        if #available(iOS 12, tvOS 12, *) {
            if let monitor = pathMonitor as? NWPathMonitor {
                monitor.cancel()
            }
            pathMonitor = nil
        }
    }

    @available(iOS 12, tvOS 12, *)
    private func startPathMonitor() {
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            self?.emitConnectivityChange(path.status == .satisfied)
        }
        monitor.start(queue: monitorQueue)
        pathMonitor = monitor
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
