import Foundation
import AmplitudeSessionReplay
import AmplitudeCore
import React

@objc(PluginSessionReplayReactNative)
class PluginSessionReplayReactNative: RCTEventEmitter {
    
    var sessionReplay: SessionReplay!
    private var hasUiChangeListeners = false
    private var recordingRequested = false

    // Keep SDK lifecycle changes and the synchronous recording query serialized.
    @objc var methodQueue: DispatchQueue { DispatchQueue.main }

    @objc func isRecording() -> NSNumber {
        let readState = {
            self.recordingRequested && ((self.sessionReplay as? InterfaceSignalProvider)?.isProviding ?? false)
        }
        let recording = Thread.isMainThread ? readState() : DispatchQueue.main.sync(execute: readState)
        return NSNumber(value: recording)
    }
    private lazy var uiChangeReceiver = UiChangeReceiver { [weak self] in
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.hasUiChangeListeners else { return }
            self.sendEvent(withName: "amplitudeSessionReplayUiChange", body: nil)
        }
    }

    override func supportedEvents() -> [String]! {
        return ["amplitudeSessionReplayUiChange"]
    }

    override func startObserving() {
        hasUiChangeListeners = true
    }

    override func stopObserving() {
        hasUiChangeListeners = false
    }
    
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
        (sessionReplay as? InterfaceSignalProvider)?.removeInterfaceSignalReceiver(uiChangeReceiver)
        recordingRequested = false
        sessionReplay?.stop()
        sessionReplay = SessionReplay(apiKey:apiKey,
                                      deviceId: deviceId,
                                      sessionId: sessionId.int64Value,
                                      sampleRate: sampleRate,
                                      logger:ConsoleLogger(logLevel: logLevel),
                                      serverZone: serverZone == "EU" ? .EU : .US,
                                      maskLevel: .fromString(maskLevel),
                                      enableRemoteConfig: enableRemoteConfig)
        // Older SDKs do not expose SessionReplay as an InterfaceSignalProvider.
        // UI change notifications require an SDK that provides this conformance.
        (sessionReplay as? InterfaceSignalProvider)?.addInterfaceSignalReceiver(uiChangeReceiver)
        if (autoStart) {
            recordingRequested = true
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
      recordingRequested = true
      sessionReplay.start()
      resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
      print("stop")
      recordingRequested = false
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
      recordingRequested = false
      (sessionReplay as? InterfaceSignalProvider)?.removeInterfaceSignalReceiver(uiChangeReceiver)
      sessionReplay.stop()
      resolve(nil)
    }

    override func invalidate() {
        recordingRequested = false
        (sessionReplay as? InterfaceSignalProvider)?.removeInterfaceSignalReceiver(uiChangeReceiver)
        sessionReplay?.stop()
        super.invalidate()
    }
}

private final class UiChangeReceiver: InterfaceSignalReceiver, @unchecked Sendable {
    private let uiChangeCallback: () -> Void

    init(uiChangeCallback: @escaping () -> Void) {
        self.uiChangeCallback = uiChangeCallback
    }

    func onInterfaceChanged(signal: InterfaceChangeSignal) {
        uiChangeCallback()
    }

    func onStartProviding() {}
    func onStopProviding() {}
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
