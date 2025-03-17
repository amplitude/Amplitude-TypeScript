import Foundation
import AmplitudeSessionReplay

@objc(PluginSessionReplayReactNative)
class PluginSessionReplayReactNative: NSObject {
    
    var sessionReplay: SessionReplay!
    
    @objc(setup:deviceId:sessionId:sampleRate:enableRemoteConfig:resolve:reject:)
    func setup(_ apiKey: String, deviceId: String, sessionId: NSNumber, sampleRate: Float, enableRemoteConfig: Bool, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
      print("setup: API Key: \(apiKey) Device Id: \(deviceId) Session Id: \(sessionId) Sample Rate: \(sampleRate) Enable Remote Config: \(enableRemoteConfig)")
      sessionReplay = SessionReplay(apiKey:apiKey,
                                    deviceId: deviceId,
                                    sessionId: sessionId.int64Value,
                                    sampleRate: sampleRate,
                                    logger:ConsoleLogger(logLevel: LogLevelEnum.DEBUG.rawValue),
                                    enableRemoteConfig: enableRemoteConfig)
      sessionReplay.start()
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
