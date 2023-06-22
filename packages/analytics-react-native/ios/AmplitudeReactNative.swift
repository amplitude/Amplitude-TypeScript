import Foundation
import React

@objc(AmplitudeReactNative)
class ReactNative: NSObject {

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc
    func getApplicationContext(
        _ options: NSDictionary,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
        let trackingOptions = options as! [String: Bool]
        let trackIdfa = trackingOptions["idfa"] ?? false
        let trackIdfv = trackingOptions["idfv"] ?? false
        let appleContextProvider = AppleContextProvider(trackIdfa: trackIdfa, trackIdfv: trackIdfv)

        var applicationContext: [String: String?] = [
            "version": appleContextProvider.version,
            "platform": appleContextProvider.platform,
            "language": appleContextProvider.language,
            "osName": appleContextProvider.osName,
            "osVersion": appleContextProvider.osVersion,
            "deviceManufacturer": appleContextProvider.deviceManufacturer,
            "deviceModel": appleContextProvider.deviceModel,
        ]
        if (trackIdfa) {
            applicationContext["idfa"] = appleContextProvider.idfa
        }
        if (trackIdfv) {
            applicationContext["idfv"] = appleContextProvider.idfv
        }
        resolve(applicationContext)
    }
}
