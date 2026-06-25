import Foundation
import React

/// No-op placeholder for the connectivity native module, bridged back to JS as
/// `AmplitudeReactNativeConnectivity`. It exists so the JS
/// `networkConnectivityCheckerPlugin` can bind to a real native module and seed
/// an initial "online" state; it never reports going offline.
///
/// Real connectivity monitoring (`NWPathMonitor` / `SCNetworkReachability`) is
/// added in a follow-up PR that replaces this file. Until then, offline mode is
/// a no-op on iOS — `getNetworkConnectivityStatus` always reports connected, so
/// the SDK never wrongly suppresses sends.
@objc(AmplitudeReactNativeConnectivity)
class AmplitudeReactNativeConnectivity: RCTEventEmitter {

    private static let connectivityEventName = "AmplitudeNetworkConnectivityChanged"

    override func supportedEvents() -> [String]! {
        return [AmplitudeReactNativeConnectivity.connectivityEventName]
    }

    @objc
    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    /// JS reads this once on setup to seed the initial `offline` value. The
    /// placeholder always reports connected.
    @objc
    func getNetworkConnectivityStatus(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) -> Void {
        resolve(["isConnected": true])
    }
}
