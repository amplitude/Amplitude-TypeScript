import Foundation
import AmplitudeSessionReplay
import AmplitudeCore
import React

@objc(PluginSessionReplayReactNative)
class PluginSessionReplayReactNative: RCTEventEmitter {
    
    var sessionReplay: SessionReplay!
    private var hasUiChangeListeners = false
    private var recordingRequested = false
    private var invalidated = false
    private var uiChangeGeneration = UUID()
    private var uiChangeReceiver: UiChangeReceiver?

    // SDK lifecycle changes and recording-state reads run on main.
    @objc var methodQueue: DispatchQueue { DispatchQueue.main }

    @objc(isRecording:reject:)
    func isRecording(_ resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { resolve(false); return }
            resolve(self.recordingRequested && ((self.sessionReplay as? InterfaceSignalProvider)?.isProviding ?? false))
        }
    }
    private func attachUiChangeReceiver() {
        guard let provider = sessionReplay as? InterfaceSignalProvider else { return }
        let generation = uiChangeGeneration
        let receiver = UiChangeReceiver { [weak self] in
            DispatchQueue.main.async { [weak self] in
                guard let self = self, !self.invalidated, self.hasUiChangeListeners,
                      self.recordingRequested, self.uiChangeGeneration == generation else { return }
                self.sendEvent(withName: "amplitudeSessionReplayUiChange", body: nil)
            }
        }
        uiChangeReceiver = receiver
        provider.addInterfaceSignalReceiver(receiver)
    }

    private func removeUiChangeReceiver() {
        // Retire queued and in-flight callbacks before detaching the old SDK receiver.
        uiChangeGeneration = UUID()
        if let receiver = uiChangeReceiver {
            (sessionReplay as? InterfaceSignalProvider)?.removeInterfaceSignalReceiver(receiver)
        }
        uiChangeReceiver = nil
    }

    override func supportedEvents() -> [String]! {
        return ["amplitudeSessionReplayUiChange"]
    }

    override func startObserving() {
        hasUiChangeListeners = !invalidated
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
        removeUiChangeReceiver()
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
        attachUiChangeReceiver()
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
      removeUiChangeReceiver()
      sessionReplay.stop()
      resolve(nil)
    }

    override func invalidate() {
        invalidated = true
        hasUiChangeListeners = false
        recordingRequested = false
        removeUiChangeReceiver()
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
