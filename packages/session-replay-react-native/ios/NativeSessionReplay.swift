import Foundation
import React
import AmplitudeSessionReplay
import AmplitudeCore

@objc(AMPNativeSessionReplay)
class NativeSessionReplay: RCTEventEmitter, @unchecked Sendable {
    var sessionReplay: SessionReplay?
    var logger: CoreLogger?
    private let listenersLock = NSRecursiveLock()
    private var interfaceSignalReceiver: RecorderSignalReceiver?
    private var hasListeners = false

    // A receiver belongs to one recorder. Queued callbacks from detached recorders
    // retain their old receiver and cannot be mistaken for callbacks from a new one.
    private final class RecorderSignalReceiver: NSObject, InterfaceSignalReceiver, @unchecked Sendable {
        private weak var owner: NativeSessionReplay?

        init(owner: NativeSessionReplay) {
            self.owner = owner
            super.init()
        }

        func onInterfaceChanged(signal: InterfaceChangeSignal) {
            owner?.emitInterfaceSignal(from: self, interfaceChanged: true,
                                       timestamp: signal.time.timeIntervalSince1970 * 1000)
        }

        func onStartProviding() { owner?.emitInterfaceSignal(from: self, isProviding: true) }
        func onStopProviding() { owner?.emitInterfaceSignal(from: self, isProviding: false) }
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
        let receiver = RecorderSignalReceiver(owner: self)
        listenersLock.lock()
        interfaceSignalReceiver = receiver
        listenersLock.unlock()
        sessionReplay?.addInterfaceSignalReceiver(receiver)

        resolve(nil)
    }
    
    @objc(setCustomSessionId:resolve:reject:)
    func setCustomSessionId(_ customSessionId: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger?.debug(message: "setCustomSessionId: \(customSessionId)")
        if let replay = sessionReplay, replay.customSessionId != customSessionId as String {
            emitInterfaceSignal(identityChanged: true)
        }
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
        logger?.debug(message: "setDeviceId: \(deviceId)")
        if let replay = sessionReplay, replay.deviceId != deviceId as String? {
            emitInterfaceSignal(identityChanged: true)
        }
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
        sessionReplay?.start()
        resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
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
        tearDownSessionReplay(emitStopProviding: false)
        super.invalidate()
    }

    private func tearDownSessionReplay(emitStopProviding: Bool = true) {
        listenersLock.lock()
        let replay = sessionReplay
        let receiver = interfaceSignalReceiver
        interfaceSignalReceiver = nil
        sessionReplay = nil
        if emitStopProviding && replay?.isProviding == true {
            emitInterfaceSignal(isProviding: false)
        }
        listenersLock.unlock()
        if let receiver { replay?.removeInterfaceSignalReceiver(receiver) }
        replay?.stop()
        logger = nil
    }

    @objc(getInterfaceSignalState:reject:)
    func getInterfaceSignalState(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        var state: [String: Any] = [:]
        state["isProviding"] = sessionReplay?.isProviding ?? false
        state["sessionId"] = sessionReplay?.customSessionId ?? "-1"
        if let deviceId = sessionReplay?.deviceId, !deviceId.isEmpty {
            state["deviceId"] = deviceId
        } else {
            state["deviceId"] = NSNull()
        }
        resolve(state)
    }
    override func supportedEvents() -> [String]! {
        ["AMPNativeSessionReplayInterfaceSignal"]
    }

    override func startObserving() {
        listenersLock.lock()
        hasListeners = true
        listenersLock.unlock()
    }

    override func stopObserving() {
        listenersLock.lock()
        hasListeners = false
        listenersLock.unlock()
    }

    private func emitInterfaceSignal(
        from receiver: RecorderSignalReceiver? = nil,
        interfaceChanged: Bool = false,
        identityChanged: Bool = false,
        isProviding: Bool? = nil,
        timestamp: Double = Date().timeIntervalSince1970 * 1000
    ) {
        listenersLock.lock()
        defer { listenersLock.unlock() }
        guard hasListeners else { return }
        if let receiver, receiver !== interfaceSignalReceiver { return }
        sendEvent(withName: "AMPNativeSessionReplayInterfaceSignal", body: [
            "interfaceChanged": interfaceChanged,
            "identityChanged": identityChanged,
            "isProviding": isProviding ?? sessionReplay?.isProviding ?? false,
            "timestamp": timestamp
        ])
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
