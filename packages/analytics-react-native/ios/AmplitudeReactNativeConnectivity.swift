import Foundation
import React
#if canImport(Network)
import Network
#endif

/// Connectivity-only native module bridged back to JS as
/// `AmplitudeReactNativeConnectivity`. It is intentionally separate from the
/// request/response `AmplitudeReactNative` module so the `RCTEventEmitter`
/// lifecycle (listener tracking, start/stop observing) stays isolated.
///
/// Connectivity is monitored with `NWPathMonitor` (Network framework, iOS 12+).
/// The podspec targets iOS 10, so offline detection is best-effort: below
/// iOS/tvOS 12 the module never reports offline, which preserves the
/// pre-offline SDK behavior (send always, existing retry handles failures).
///
/// `getNetworkConnectivityStatus` resolves connected unconditionally. The real
/// initial state arrives via the monitor's first update instead:
/// `nw_path_monitor_set_update_handler` is documented to call the handler
/// "with the current path when start is called", so the first emit after JS
/// subscribes carries the actual state — no separate probe needed.
@objc(AmplitudeReactNativeConnectivity)
class AmplitudeReactNativeConnectivity: RCTEventEmitter {

    private static let connectivityEventName = "AmplitudeNetworkConnectivityChanged"

    private var hasListeners = false
    private let monitorQueue = DispatchQueue(label: "com.amplitude.reactnative.connectivity")

    // iOS 12+ path
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

    /// Seed read JS performs once on setup (Android answers it with a real
    /// `ConnectivityManager` read, mirroring Amplitude-Kotlin). On iOS it
    /// resolves connected unconditionally: `NWPathMonitor` delivers the current
    /// path as its first update once JS subscribes, correcting the seed within
    /// milliseconds, and below iOS 12 best-effort means always connected.
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
        // Below iOS/tvOS 12 monitoring is unsupported; connectivity stays "connected".
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
