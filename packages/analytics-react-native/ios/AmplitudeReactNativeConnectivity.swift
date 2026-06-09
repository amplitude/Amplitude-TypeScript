import Foundation
import React
import SystemConfiguration
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
/// iOS/tvOS 12 the module always reports connected — both the initial seed and
/// change events — which preserves the pre-offline SDK behavior (send always,
/// existing retry handles failures). Reporting offline without a monitor to
/// flip it back would buffer events forever.
///
/// The current connectivity state is always computed on demand from a fresh
/// `SCNetworkReachability` probe (see `currentConnectivity()`), so the initial
/// state JS reads via `getNetworkConnectivityStatus` is correct even before the
/// path monitor has started, and there is no shared mutable state to race on.
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

    /// Returns the current connectivity state. `startObserving` only fires on
    /// subsequent changes, so JS reads this once on setup to seed the initial
    /// `offline` value. The value is computed from a fresh reachability probe so
    /// it is correct even before monitoring has started.
    @objc
    func getNetworkConnectivityStatus(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) -> Void {
        resolve(["isConnected": currentConnectivity()])
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

    /// Computes the current connectivity from a fresh `SCNetworkReachability`
    /// probe. This does not depend on the monitor being started, so it returns a
    /// correct value when JS seeds the initial state. Defaults to connected when
    /// the state can't be determined, so we never wrongly suppress sends.
    ///
    /// Below iOS/tvOS 12 this must report connected unconditionally: there is no
    /// monitor to emit a later change, so seeding offline would buffer events
    /// forever.
    private func currentConnectivity() -> Bool {
        guard #available(iOS 12, tvOS 12, *) else { return true }
        guard let reachability = createReachability() else { return true }
        var flags = SCNetworkReachabilityFlags()
        guard SCNetworkReachabilityGetFlags(reachability, &flags) else { return true }
        return AmplitudeReactNativeConnectivity.isReachable(flags)
    }

    private func createReachability() -> SCNetworkReachability? {
        var zeroAddress = sockaddr_in()
        zeroAddress.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        zeroAddress.sin_family = sa_family_t(AF_INET)

        return withUnsafePointer(to: &zeroAddress) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { address in
                SCNetworkReachabilityCreateWithAddress(nil, address)
            }
        }
    }

    private static func isReachable(_ flags: SCNetworkReachabilityFlags) -> Bool {
        let reachable = flags.contains(.reachable)
        let requiresConnection = flags.contains(.connectionRequired)
        let canConnectAutomatically = flags.contains(.connectionOnDemand) || flags.contains(.connectionOnTraffic)
        let canConnectWithoutUserInteraction = canConnectAutomatically && !flags.contains(.interventionRequired)
        return reachable && (!requiresConnection || canConnectWithoutUserInteraction)
    }
}
