import Foundation
import React
import AmplitudeSessionReplay
import AmplitudeCore

@objc(AMPNativeSessionReplay)
class NativeSessionReplay: RCTEventEmitter, InterfaceSignalReceiver, @unchecked Sendable {
    var sessionReplay: SessionReplay?
    var logger: CoreLogger?
    private var hasListeners = false
    
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
        tearDownSessionReplay()
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
        sessionReplay?.addInterfaceSignalReceiver(self)

        resolve(nil)
    }
    
    @objc(setCustomSessionId:resolve:reject:)
    func setCustomSessionId(_ customSessionId: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        emitInterfaceSignal("stateChanged")
        logger?.debug(message: "setCustomSessionId: \(customSessionId)")
        sessionReplay?.customSessionId = customSessionId as String
        resolve(nil)
    }

    @objc(getDeviceId:reject:)
    func getDeviceId(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        resolve(sessionReplay?.deviceId)
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
        emitInterfaceSignal("stateChanged")
        logger?.debug(message: "setDeviceId: \(deviceId)")
        sessionReplay?.deviceId = deviceId as String?
        resolve(nil)
    }

    @objc(setOptOut:resolve:reject:)
    func setOptOut(_ optOut: Bool, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        emitInterfaceSignal("stateChanged")
        logger?.debug(message: "setOptOut: \(optOut)")
        sessionReplay?.optOut = optOut
        resolve(nil)
    }
    
    @objc(start:reject:)
    func start(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        emitInterfaceSignal("stateChanged")
        logger?.debug(message: "start")
        sessionReplay?.start()
        resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        emitInterfaceSignal("stateChanged")
        logger?.debug(message: "stop")
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
    
    @objc(invalidate)
    override func invalidate() {
        print("invalidate")
        tearDownSessionReplay()
        super.invalidate()
    }

    private func tearDownSessionReplay() {
        emitInterfaceSignal("stateChanged")
        sessionReplay?.removeInterfaceSignalReceiver(self)
        sessionReplay?.stop()
        sessionReplay = nil
        logger = nil
    }

    @objc(getInterfaceSignalState:reject:)
    func getInterfaceSignalState(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        // Replay updates capture availability on the main queue.
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                resolve(["isProviding": false])
                return
            }
            var state: [String: Any] = [:]
            state["isProviding"] = self.sessionReplay?.isProviding ?? false
            state["sessionId"] = self.sessionReplay?.customSessionId ?? "-1"
            state["deviceId"] = self.sessionReplay?.deviceId as Any? ?? NSNull()
            resolve(state)
        }
    }
    override func supportedEvents() -> [String]! {
        ["AMPNativeSessionReplayInterfaceSignal"]
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
            self.sendEvent(withName: "AMPNativeSessionReplayInterfaceSignal", body: ["type": type, "timestamp": timestamp])
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
