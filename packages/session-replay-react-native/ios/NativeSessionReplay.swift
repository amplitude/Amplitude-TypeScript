import Foundation
import AmplitudeSessionReplay
import AmplitudeCore
import React

@objc(AMPNativeSessionReplay)
class NativeSessionReplay: RCTEventEmitter {
    var sessionReplay: SessionReplay?
    var logger: CoreLogger?
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
            resolve(self.recordingRequested && (self.sessionReplay?.isProviding ?? false))
        }
    }

    private func attachUiChangeReceiver() {
        guard let provider = sessionReplay else { return }
        let generation = uiChangeGeneration
        let receiver = UiChangeReceiver { [weak self] in
            DispatchQueue.main.async { [weak self] in
                guard let self = self, !self.invalidated, self.hasUiChangeListeners,
                      self.recordingRequested, self.uiChangeGeneration == generation else { return }
                self.sendEvent(withName: "amplitudeSessionReplayReactNativeUiChange", body: nil)
            }
        }
        uiChangeReceiver = receiver
        provider.addInterfaceSignalReceiver(receiver)
    }

    private func removeUiChangeReceiver() {
        // Retire queued and in-flight callbacks before detaching the old SDK receiver.
        uiChangeGeneration = UUID()
        if let receiver = uiChangeReceiver {
            sessionReplay?.removeInterfaceSignalReceiver(receiver)
        }
        uiChangeReceiver = nil
    }

    override func supportedEvents() -> [String]! {
        return ["amplitudeSessionReplayReactNativeUiChange"]
    }

    override func startObserving() {
        hasUiChangeListeners = !invalidated
    }

    override func stopObserving() {
        hasUiChangeListeners = false
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
        recordingRequested = false
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
        recordingRequested = true
        sessionReplay?.start()
        resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger?.debug(message: "stop")
        recordingRequested = false
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
        invalidated = true
        hasUiChangeListeners = false
        print("invalidate")
        tearDownSessionReplay()
        super.invalidate()
    }

    private func tearDownSessionReplay() {
        recordingRequested = false
        removeUiChangeReceiver()
        sessionReplay?.stop()
        sessionReplay = nil
        logger = nil
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
