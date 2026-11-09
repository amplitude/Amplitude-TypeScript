import Foundation
import AmplitudeSessionReplay
import AmplitudeCore
import React

@objc(PluginSessionReplayReactNative)
class PluginSessionReplayReactNative: RCTEventEmitter {
    
    private let stateLock = NSLock()
    private var currentSessionReplay: SessionReplay?
    var sessionReplay: SessionReplay! {
        get { stateLock.withLock { currentSessionReplay } }
        set { stateLock.withLock { currentSessionReplay = newValue } }
    }
    private var hasUiChangeListeners = false
    private var recordingRequested = false
    private var invalidated = false
    private var uiChangeReceiver: UiChangeReceiver?

    @objc(isRecording:reject:)
    func isRecording(_ resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        // SDK >= 0.16.1 synchronizes isProviding internally; read it outside our lock.
        let (requested, replay) = stateLock.withLock {
            (!invalidated && recordingRequested, currentSessionReplay)
        }
        resolve(requested && (replay?.isProviding ?? false))
    }
    private func attachUiChangeReceiver() {
        guard let provider = sessionReplay else { return }
        let receiver = UiChangeReceiver { [weak self] receiver, timestamp in
            guard let self = self else { return }
            self.stateLock.withLock {
                // JS cannot distinguish callbacks from an SDK instance already replaced.
                guard !self.invalidated, self.hasUiChangeListeners, self.recordingRequested,
                      self.uiChangeReceiver === receiver else { return }
                self.sendEvent(withName: "amplitudeSessionReplayUiChange", body: ["timestamp": timestamp])
            }
        }
        stateLock.withLock { uiChangeReceiver = receiver }
        provider.addInterfaceSignalReceiver(receiver)
    }

    private func removeUiChangeReceiver() {
        let (provider, receiver) = stateLock.withLock {
            let receiver = uiChangeReceiver
            uiChangeReceiver = nil
            return (currentSessionReplay, receiver)
        }
        // Never hold the state lock while calling back into the SDK.
        if let receiver = receiver { provider?.removeInterfaceSignalReceiver(receiver) }
    }

    override func supportedEvents() -> [String]! {
        return ["amplitudeSessionReplayUiChange"]
    }

    override func startObserving() {
        stateLock.withLock { hasUiChangeListeners = !invalidated }
    }

    override func stopObserving() {
        stateLock.withLock { hasUiChangeListeners = false }
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
        stateLock.withLock { recordingRequested = false }
        sessionReplay?.stop()
        sessionReplay = SessionReplay(apiKey:apiKey,
                                      deviceId: deviceId,
                                      sessionId: sessionId.int64Value,
                                      sampleRate: sampleRate,
                                      logger:ConsoleLogger(logLevel: logLevel),
                                      serverZone: serverZone == "EU" ? .EU : .US,
                                      maskLevel: .fromString(maskLevel),
                                      enableRemoteConfig: enableRemoteConfig)
        attachUiChangeReceiver()
        if (autoStart) {
            stateLock.withLock { recordingRequested = true }
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
      stateLock.withLock { recordingRequested = true }
      sessionReplay.start()
      resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
      print("stop")
      stateLock.withLock { recordingRequested = false }
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
      stateLock.withLock { recordingRequested = false }
      removeUiChangeReceiver()
      sessionReplay.stop()
      resolve(nil)
    }

    override func invalidate() {
        stateLock.withLock {
            invalidated = true
            hasUiChangeListeners = false
            recordingRequested = false
        }
        removeUiChangeReceiver()
        sessionReplay?.stop()
        super.invalidate()
    }
}

private final class UiChangeReceiver: InterfaceSignalReceiver, @unchecked Sendable {
    private let uiChangeCallback: (UiChangeReceiver, Double) -> Void

    init(uiChangeCallback: @escaping (UiChangeReceiver, Double) -> Void) {
        self.uiChangeCallback = uiChangeCallback
    }

    func onInterfaceChanged(signal: InterfaceChangeSignal) {
        uiChangeCallback(self, signal.time.timeIntervalSince1970 * 1000)
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
