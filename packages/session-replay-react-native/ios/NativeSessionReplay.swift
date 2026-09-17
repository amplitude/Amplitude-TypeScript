import Foundation
import AmplitudeSessionReplay
import AmplitudeCore

@objc(AMPNativeSessionReplay)
class NativeSessionReplay: NSObject, RCTBridgeModule {
    static func moduleName() -> String! {
        "AMPNativeSessionReplay"
    }
    
    var sessionReplay: SessionReplay?
    var logger: CoreLogger?
    
    override init() {
        print("NativeSessionReplay init")
    }
    
    @objc(setup:resolve:reject:)
    func setup(_ config: NSDictionary, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        guard let apiKey = config["apiKey"] as? String,
              let serverZone = config["serverZone"] as? String,
              let sampleRate = config["sampleRate"] as? NSNumber,
              let enableRemoteConfig = config["enableRemoteConfig"] as? Bool,
              let logLevel = config["logLevel"] as? Int,
              let maskLevel = config["maskLevel"] as? String,
              let optOut = config["optOut"] as? Bool else {
            reject("INVALID_CONFIG", "Invalid configuration parameters", nil)
            return
        }
        
        let deviceId = config["deviceId"] as? String
        let createdLogger = OSLogger(logLevel: LogLevel(rawValue: logLevel) ?? .warn)
        logger = createdLogger
        
        createdLogger.log(message:
            """
            setup:
            API Key: \(apiKey)
            Device ID: \(deviceId ?? "null")
            Custom Session ID: \(config["customSessionId"] as? String ?? "null")
            Server Zone: \(serverZone)
            Sample Rate: \(sampleRate)
            Enable Remote Config: \(enableRemoteConfig)
            Log Level: \(logLevel)
            Mask Level: \(maskLevel)
            Opt Out: \(optOut)
            """
        )
        
        sessionReplay = SessionReplay(
            apiKey: apiKey,
            deviceId: deviceId,
            // Session identity is driven purely by customSessionId (set below).
            // Pass the -1 "unset" sentinel for the numeric session id the SDK
            // initializer still requires.
            sessionId: -1,
            optOut: optOut,
            sampleRate: Float(truncating: sampleRate),
            logger: createdLogger,
            serverZone: serverZone == "EU" ? .EU : .US,
            maskLevel: .fromString(maskLevel),
            enableRemoteConfig: enableRemoteConfig
        )

        if let customSessionId = config["customSessionId"] as? String, !customSessionId.isEmpty {
            sessionReplay?.customSessionId = customSessionId
        }
        
        resolve(nil)
    }
    
    @objc(setCustomSessionId:resolve:reject:)
    func setCustomSessionId(_ customSessionId: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger?.debug(message: "setCustomSessionId: \(customSessionId)")
        sessionReplay?.customSessionId = customSessionId as String
        resolve(nil)
    }

    @objc(getCustomSessionId:reject:)
    func getCustomSessionId(
        _ resolve: RCTPromiseResolveBlock,
        reject: RCTPromiseRejectBlock
    ) {
        logger?.debug(message: "getCustomSessionId")
        if let customSessionId = sessionReplay?.customSessionId {
            resolve(customSessionId)
        } else {
            resolve(nil)
        }
    }
    
    @objc(setDeviceId:resolve:reject:)
    func setDeviceId(_ deviceId: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger?.debug(message: "setDeviceId: \(deviceId)")
        sessionReplay?.deviceId = deviceId as String?
        resolve(nil)
    }

    @objc(setOptOut:resolve:reject:)
    func setOptOut(_ optOut: Bool, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger?.debug(message: "setOptOut: \(optOut)")
        sessionReplay?.optOut = optOut
        resolve(nil)
    }
    
    @objc(start:reject:)
    func start(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger?.debug(message: "start")
        sessionReplay?.start()
        resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger?.debug(message: "stop")
        sessionReplay?.stop()
        resolve(nil)
    }
    
    @objc(flush:reject:)
    func flush(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger?.debug(message: "flush")
        sessionReplay?.flush()
        resolve(nil)
    }

    @objc(teardown:reject:)
    func teardown(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger?.debug(message: "teardown")
        tearDownSessionReplay()
        resolve(nil)
    }
    
    @objc(invalidate)
    func invalidate() {
        print("invalidate")
        tearDownSessionReplay()
    }

    private func tearDownSessionReplay() {
        sessionReplay?.stop()
        sessionReplay = nil
        logger = nil
    }
}

extension MaskLevel {
    static func fromString(_ input: String) -> MaskLevel {
        switch input.lowercased() {
        case "light":
            return .light
        case "medium":
            return .medium
        case "conservative":
            return .conservative
        default:
            return .medium
        }
    }
}
