import Foundation
import AmplitudeSessionReplay

@objc(NativeSessionReplay)
class NativeSessionReplay: NSObject, RCTBridgeModule {
    static func moduleName() -> String! {
        "NativeSessionReplay"
    }
    
    var sessionReplay: SessionReplay!
    var logger: ConsoleLogger!
    
    override init() {
        print("NativeSessionReplay init")
    }
    
    @objc(setup:resolve:reject:)
    func setup(_ config: NSDictionary, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        guard let apiKey = config["apiKey"] as? String,
              let sessionId = config["sessionId"] as? NSNumber,
              let serverZone = config["serverZone"] as? String,
              let sampleRate = config["sampleRate"] as? Float,
              let enableRemoteConfig = config["enableRemoteConfig"] as? Bool,
              let logLevel = config["logLevel"] as? Int,
              let autoStart = config["autoStart"] as? Bool,
              let maskLevel = config["maskLevel"] as? String,
              let optOut = config["optOut"] as? Bool else {
            reject("INVALID_CONFIG", "Invalid configuration parameters", nil)
            return
        }
        
        let deviceId = config["deviceId"] as? String
        
        logger = ConsoleLogger(logLevel: logLevel)
        
        logger.log(message:
            """
            setup:
            API Key: \(apiKey)
            Device ID: \(deviceId ?? "null")
            Session ID: \(sessionId)
            Server Zone: \(serverZone)
            Sample Rate: \(sampleRate)
            Enable Remote Config: \(enableRemoteConfig)
            Log Level: \(logLevel)
            Auto Start: \(autoStart)
            Mask Level: \(maskLevel)
            Opt Out: \(optOut)
            """
        )
        
        sessionReplay = SessionReplay(
            apiKey: apiKey,
            deviceId: deviceId,
            sessionId: sessionId.int64Value,
            optOut: optOut,
            sampleRate: sampleRate,
            logger: logger,
            serverZone: serverZone == "EU" ? .EU : .US,
            maskLevel: .fromString(maskLevel),
            enableRemoteConfig: enableRemoteConfig
        )
        
        if (autoStart) {
            sessionReplay.start()
        }
        resolve(nil)
    }
    
    @objc(setSessionId:resolve:reject:)
    func setSessionId(_ sessionId: NSNumber, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger.debug(message: "setSessionId: \(sessionId)")
        sessionReplay.sessionId = sessionId.int64Value
        resolve(nil)
    }
    
    @objc(setDeviceId:resolve:reject:)
    func setDeviceId(_ deviceId: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger.debug(message: "setDeviceId: \(deviceId)")
        sessionReplay.deviceId = deviceId as String?
        resolve(nil)
    }
    
    @objc(getSessionId:reject:)
    func getSessionId(
        _ resolve: RCTPromiseResolveBlock,
        reject: RCTPromiseRejectBlock
    ) {
        logger.debug(message: "getSessionId")
        resolve(NSNumber(value:sessionReplay.sessionId))
    }
    
    @objc(getSessionReplayProperties:reject:)
    func getSessionReplayProperties(
        _ resolve: RCTPromiseResolveBlock,
        reject: RCTPromiseRejectBlock
    ) {
        logger.debug(message: "getSessionReplayProperties")
        resolve(sessionReplay.additionalEventProperties)
    }
    
    @objc(start:reject:)
    func start(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger.debug(message: "start")
        sessionReplay.start()
        print(sessionReplay.additionalEventProperties)
        print(
            "SessionId: \(sessionReplay.sessionId); DeviceId: \(sessionReplay.deviceId ?? "nil")"
        )
        resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger.debug(message: "stop")
        sessionReplay.stop()
        resolve(nil)
    }
    
    @objc(flush:reject:)
    func flush(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger.debug(message: "flush")
        sessionReplay.flush()
        resolve(nil)
    }
    
    @objc(invalidate)
    func invalidate() {
        print("invalidate")
        // could be nil here
        sessionReplay?.stop()
        sessionReplay = nil
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
