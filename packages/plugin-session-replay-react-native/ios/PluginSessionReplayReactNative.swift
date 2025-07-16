import Foundation
import AmplitudeSessionReplay

@objc(PluginSessionReplayReactNative)
class PluginSessionReplayReactNative: NSObject {
    
    var sessionReplay: SessionReplay!
    
    @objc(setup:deviceId:sessionId:serverZone:sampleRate:enableRemoteConfig:logLevel:autoStart:resolve:reject:)
    func setup(_ apiKey: String,
               deviceId: String,
               sessionId: NSNumber,
               serverZone: String,
               sampleRate: Float,
               enableRemoteConfig: Bool,
               logLevel: Int,
               autoStart: Bool,
               resolve: RCTPromiseResolveBlock,
               reject: RCTPromiseRejectBlock) -> Void {
        print(
            """
            setup:
            API Key: \(apiKey)
            Device Id: \(deviceId)
            Session Id: \(sessionId)
            Server Zone: \(serverZone)
            Sample Rate: \(sampleRate)
            Enable Remote Config: \(enableRemoteConfig)
            Log Level: \(logLevel)
            Auto Start: \(autoStart)
            """
        )
        sessionReplay = SessionReplay(apiKey:apiKey,
                                      deviceId: deviceId,
                                      sessionId: sessionId.int64Value,
                                      sampleRate: sampleRate,
                                      logger:ConsoleLogger(logLevel: logLevel),
                                      serverZone: serverZone == "EU" ? .EU : .US,
                                      enableRemoteConfig: enableRemoteConfig)
        if (autoStart) {
            sessionReplay.start()
        }
        resolve(nil)
    }
    
    @objc(setSessionId:resolve:reject:)
    func setSessionId(_ sessionId: NSNumber, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
      print("setSessionId: \(sessionId)")
      sessionReplay.sessionId = sessionId.int64Value
      resolve(nil)
    }
    
    @objc(getSessionId:reject:)
    func getSessionId(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
      print("getSessionId")
      resolve(NSNumber(value:sessionReplay.sessionId))
    }
    
    @objc(getSessionReplayProperties:reject:)
    func getSessionReplayProperties(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
      print("getSessionReplayProperties")
      resolve(sessionReplay.additionalEventProperties)
    }
    
    @objc(start:reject:)
    func start(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
      print("start")
      sessionReplay.start()
      resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
      print("stop")
      sessionReplay.stop()
      resolve(nil)
    }
    
    @objc(flush:reject:)
    func flush(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
      print("flush")
      sessionReplay.flush()
      resolve(nil)
    }
    
    @objc(teardown:reject:)
    func teardown(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
      print("teardown")
      sessionReplay.stop()
      resolve(nil)
    }
}
