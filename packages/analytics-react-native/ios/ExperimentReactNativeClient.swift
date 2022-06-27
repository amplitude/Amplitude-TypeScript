import Foundation

@objc(ExperimentReactNativeClient)
class ExperimentReactNativeClient: NSObject {

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
        let applicationContext = [
            "version": appleContextProvider.version,
            "platform": appleContextProvider.platform,
            "language": appleContextProvider.language,
            "os": appleContextProvider.os,
            "device_manufacturer": appleContextProvider.deviceManufacturer,
            "device_model": appleContextProvider.deviceModel,
        ]
        resolve(applicationContext)
    }
}
