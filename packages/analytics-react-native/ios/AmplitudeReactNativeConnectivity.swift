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
/// Connectivity is monitored with `NWPathMonitor` (Network framework) when
/// available (iOS 12+). The podspec targets iOS 10, so on iOS 10/11 we fall
/// back to `SCNetworkReachability` (SystemConfiguration) rather than bumping
/// the deployment target.
@objc(AmplitudeReactNativeConnectivity)
class AmplitudeReactNativeConnectivity: RCTEventEmitter {

    private static let connectivityEventName = "AmplitudeNetworkConnectivityChanged"

    private var hasListeners = false
    private let monitorQueue = DispatchQueue(label: "com.amplitude.reactnative.connectivity")

    // iOS 12+ path
    private var pathMonitor: AnyObject?

    // iOS 10/11 fallback
    private var reachability: SCNetworkReachability?

    // Last known connectivity state, used to seed JS and to dedupe.
    private var isConnected = true

    override init() {
        super.init()
    }

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
    /// `offline` value.
    @objc
    func getNetworkConnectivityStatus(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) -> Void {
        resolve(["isConnected": currentConnectivity()])
    }

    // MARK: Monitoring

    private func startMonitoring() {
        if #available(iOS 12, tvOS 12, *) {
            startPathMonitor()
        } else {
            startReachability()
        }
    }

    private func stopMonitoring() {
        if #available(iOS 12, tvOS 12, *) {
            if let monitor = pathMonitor as? NWPathMonitor {
                monitor.cancel()
            }
            pathMonitor = nil
        }
        if let reachability = reachability {
            SCNetworkReachabilitySetCallback(reachability, nil, nil)
            SCNetworkReachabilitySetDispatchQueue(reachability, nil)
            self.reachability = nil
        }
    }

    @available(iOS 12, tvOS 12, *)
    private func startPathMonitor() {
        guard pathMonitor == nil else { return }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            self?.handleConnectivityChange(path.status == .satisfied)
        }
        monitor.start(queue: monitorQueue)
        pathMonitor = monitor
    }

    private func startReachability() {
        guard reachability == nil else { return }
        var zeroAddress = sockaddr_in()
        zeroAddress.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        zeroAddress.sin_family = sa_family_t(AF_INET)

        guard let reachability = withUnsafePointer(to: &zeroAddress, { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { address in
                SCNetworkReachabilityCreateWithAddress(nil, address)
            }
        }) else {
            return
        }
        self.reachability = reachability

        var context = SCNetworkReachabilityContext(
            version: 0,
            info: Unmanaged.passUnretained(self).toOpaque(),
            retain: nil,
            release: nil,
            copyDescription: nil
        )

        let callback: SCNetworkReachabilityCallBack = { (_, flags, info) in
            guard let info = info else { return }
            let instance = Unmanaged<AmplitudeReactNativeConnectivity>.fromOpaque(info).takeUnretainedValue()
            instance.handleConnectivityChange(AmplitudeReactNativeConnectivity.isReachable(flags))
        }

        SCNetworkReachabilitySetCallback(reachability, callback, &context)
        SCNetworkReachabilitySetDispatchQueue(reachability, monitorQueue)

        // Emit the current state once monitoring starts.
        handleConnectivityChange(currentConnectivity())
    }

    // MARK: Helpers

    private func handleConnectivityChange(_ connected: Bool) {
        isConnected = connected
        guard hasListeners else { return }
        sendEvent(
            withName: AmplitudeReactNativeConnectivity.connectivityEventName,
            body: ["isConnected": connected]
        )
    }

    private func currentConnectivity() -> Bool {
        if #available(iOS 12, tvOS 12, *) {
            if let monitor = pathMonitor as? NWPathMonitor {
                return monitor.currentPath.status == .satisfied
            }
        }
        var flags = SCNetworkReachabilityFlags()
        if let reachability = reachability, SCNetworkReachabilityGetFlags(reachability, &flags) {
            return AmplitudeReactNativeConnectivity.isReachable(flags)
        }
        // Default to connected when we can't determine the state, so we never
        // wrongly suppress event delivery.
        return isConnected
    }

    private static func isReachable(_ flags: SCNetworkReachabilityFlags) -> Bool {
        let isReachable = flags.contains(.reachable)
        let needsConnection = flags.contains(.connectionRequired)
        return isReachable && !needsConnection
    }
}
