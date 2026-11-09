import Foundation
import AmplitudeSessionReplay
import AmplitudeCore
import React

@objc(AMPNativeSessionReplay)
class NativeSessionReplay: RCTEventEmitter {
    private let stateLock = NSLock()
    private var currentSessionReplay: SessionReplay?
    var sessionReplay: SessionReplay? {
        get { stateLock.withLock { currentSessionReplay } }
        set { stateLock.withLock { currentSessionReplay = newValue } }
    }
    var logger: CoreLogger?
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
                self.sendEvent(withName: "amplitudeSessionReplayReactNativeUiChange", body: ["timestamp": timestamp])
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
        return ["amplitudeSessionReplayReactNativeUiChange"]
    }

    override func startObserving() {
        stateLock.withLock { hasUiChangeListeners = !invalidated }
    }

    override func stopObserving() {
        stateLock.withLock { hasUiChangeListeners = false }
    }
    
    override init() {
        super.init()
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
              let optOut = config["optOut"] as? Bool,
              let customSessionId = config["customSessionId"] as? String else {
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
            Custom Session ID: \(customSessionId)
            Server Zone: \(serverZone)
            Sample Rate: \(sampleRate)
            Enable Remote Config: \(enableRemoteConfig)
            Log Level: \(logLevel)
            Mask Level: \(maskLevel)
            Opt Out: \(optOut)
            """
        )
        
        removeUiChangeReceiver()
        stateLock.withLock { recordingRequested = false }
        sessionReplay?.stop()
        sessionReplay = SessionReplay(
            apiKey: apiKey,
            deviceId: deviceId,
            sessionId: -1,
            optOut: optOut,
            sampleRate: Float(truncating: sampleRate),
            logger: createdLogger,
            serverZone: serverZone == "EU" ? .EU : .US,
            maskLevel: .fromString(maskLevel),
            enableRemoteConfig: enableRemoteConfig
        )

        sessionReplay?.customSessionId = customSessionId
        attachUiChangeReceiver()

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
        resolve(sessionReplay?.customSessionId ?? "-1")
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
        stateLock.withLock { recordingRequested = true }
        sessionReplay?.start()
        resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger?.debug(message: "stop")
        stateLock.withLock { recordingRequested = false }
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
    
    override func invalidate() {
        stateLock.withLock {
            invalidated = true
            hasUiChangeListeners = false
            recordingRequested = false
        }
        print("invalidate")
        tearDownSessionReplay()
        super.invalidate()
    }

    private func tearDownSessionReplay() {
        stateLock.withLock { recordingRequested = false }
        removeUiChangeReceiver()
        sessionReplay?.stop()
        sessionReplay = nil
        logger = nil
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
