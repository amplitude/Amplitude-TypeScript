//
//  SessionReplayPluginModule.swift
//  example
//
//  Created by Curtis Liu on 10/7/24.
//
import Foundation
import AmplitudeSessionReplay


@objc(SessionReplayPluginModule)
class SessionReplayPluginModule: NSObject {
  
  var sessionReplay: SessionReplay!
  
  @objc(setup:deviceId:sessionId:resolve:reject:)
  func setup(_ apiKey: String, deviceId: String, sessionId: NSNumber, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
    print("setup: \(apiKey) \(deviceId) \(sessionId)")
    sessionReplay = SessionReplay(apiKey:apiKey,
                                  deviceId: deviceId,
                                  sessionId: sessionId.int64Value,
                                  sampleRate: 1.0,
                                  logger:ConsoleLogger(logLevel: LogLevelEnum.DEBUG.rawValue),
                                  enableRemoteConfig: false)
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
