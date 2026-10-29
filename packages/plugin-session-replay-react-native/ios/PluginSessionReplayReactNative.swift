import Foundation
import React
import AmplitudeSessionReplay
import AmplitudeCore

@objc(PluginSessionReplayReactNative)
class PluginSessionReplayReactNative: RCTEventEmitter, InterfaceSignalReceiver, @unchecked Sendable {
    
    var sessionReplay: SessionReplay!
    private var hasListeners = false
    
    @objc(setup:deviceId:sessionId:serverZone:sampleRate:enableRemoteConfig:logLevel:autoStart:maskLevel:resolve:reject:)
    func setup(_ apiKey: String,
               deviceId: String,
               sessionId: NSNumber,
               serverZone: String,
               sampleRate: Float,
               enableRemoteConfig: Bool,
               logLevel: Int,
               autoStart: Bool,
               maskLevel: String,
               resolve: RCTPromiseResolveBlock,
               reject: RCTPromiseRejectBlock) -> Void {
        emitInterfaceSignal("stateChanged")
        sessionReplay?.removeInterfaceSignalReceiver(self)
        sessionReplay?.stop()
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
            Mask Level: \(maskLevel)
            """
        )
        sessionReplay = SessionReplay(apiKey:apiKey,
                                      deviceId: deviceId,
                                      sessionId: sessionId.int64Value,
                                      sampleRate: sampleRate,
                                      logger:ConsoleLogger(logLevel: logLevel),
                                      serverZone: serverZone == "EU" ? .EU : .US,
                                      maskLevel: .fromString(maskLevel),
                                      enableRemoteConfig: enableRemoteConfig)
        sessionReplay.addInterfaceSignalReceiver(self)
        if (autoStart) {
            sessionReplay.start()
        }
        resolve(nil)
    }
    
    @objc(setSessionId:resolve:reject:)
    func setSessionId(_ sessionId: NSNumber, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        emitInterfaceSignal("stateChanged")
      print("setSessionId: \(sessionId)")
      sessionReplay.sessionId = sessionId.int64Value
      resolve(nil)
    }

    @objc(getDeviceId:reject:)
    func getDeviceId(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        resolve(sessionReplay?.deviceId)
    }

    @objc(setDeviceId:resolve:reject:)
    func setDeviceId(_ deviceId: NSString?, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        emitInterfaceSignal("stateChanged")
        sessionReplay?.deviceId = deviceId as String?
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
        emitInterfaceSignal("stateChanged")
      print("start")
      sessionReplay.start()
      resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        emitInterfaceSignal("stateChanged")
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
        emitInterfaceSignal("stateChanged")
      sessionReplay?.removeInterfaceSignalReceiver(self)
      print("teardown")
      sessionReplay.stop()
      resolve(nil)
    }

    @objc(getInterfaceSignalState:reject:)
    func getInterfaceSignalState(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                resolve(["isProviding": false])
                return
            }
            var state: [String: Any] = [:]
            state["isProviding"] = self.sessionReplay?.isProviding ?? false
            state["sessionId"] = self.sessionReplay.map { String($0.sessionId) } ?? "-1"
            state["deviceId"] = self.sessionReplay?.deviceId as Any? ?? NSNull()
            resolve(state)
        }
    }

    override func invalidate() {
        sessionReplay?.removeInterfaceSignalReceiver(self)
        sessionReplay?.stop()
        sessionReplay = nil
        super.invalidate()
    }

    override func supportedEvents() -> [String]! {
        ["PluginSessionReplayReactNativeInterfaceSignal"]
    }

    override func startObserving() {
        DispatchQueue.main.async { [weak self] in self?.hasListeners = true }
    }

    override func stopObserving() {
        DispatchQueue.main.async { [weak self] in self?.hasListeners = false }
    }

    func onInterfaceChanged(signal: InterfaceChangeSignal) {
        emitInterfaceSignal("interfaceChanged", timestamp: signal.time.timeIntervalSince1970 * 1000)
    }

    func onStartProviding() { emitInterfaceSignal("stateChanged") }
    func onStopProviding() { emitInterfaceSignal("stateChanged") }

    private func emitInterfaceSignal(_ type: String, timestamp: Double = Date().timeIntervalSince1970 * 1000) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.hasListeners else { return }
            self.sendEvent(withName: "PluginSessionReplayReactNativeInterfaceSignal", body: ["type": type, "timestamp": timestamp])
        }
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
