import Foundation

@objc(AmplitudeReactNative)
class ReactNative: NSObject {

    private let appleContextProvider = AppleContextProvider()

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc
    func getApplicationContext(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
        let applicationContext: [String: String?] = [
            "version": appleContextProvider.version,
            "platform": appleContextProvider.platform,
            "language": appleContextProvider.language,
            "os_name": appleContextProvider.osName,
            "os_version": appleContextProvider.osVersion,
            "device_manufacturer": appleContextProvider.deviceManufacturer,
            "device_model": appleContextProvider.deviceModel,
        ]
        resolve(applicationContext)
    }
}
