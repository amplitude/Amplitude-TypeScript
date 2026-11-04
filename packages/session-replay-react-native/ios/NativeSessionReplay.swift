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
    private var signalObservers = 0
    private var signalSequence = 0
    private var reportedSessionId: String?
    private var reportedDeviceId: String?
    private var hasReportedState = false

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
        listenersLock.lock()
        defer { listenersLock.unlock() }
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

        emitInterfaceSignal()
        resolve(nil)
    }
    
    @objc(setCustomSessionId:resolve:reject:)
    func setCustomSessionId(_ customSessionId: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger?.debug(message: "setCustomSessionId: \(customSessionId)")
        listenersLock.lock()
        defer { listenersLock.unlock() }
        let changed = sessionReplay.map { $0.customSessionId != customSessionId as String } ?? false
        sessionReplay?.customSessionId = customSessionId as String
        if changed { emitInterfaceSignal(identityChanged: true) }
        resolve(nil)
    }

    @objc(getDeviceId:reject:)
    func getDeviceId(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        listenersLock.lock()
        defer { listenersLock.unlock() }
        resolve(sessionReplay?.deviceId)
    }

    @objc(getCustomSessionId:reject:)
    func getCustomSessionId(
        _ resolve: RCTPromiseResolveBlock,
        reject: RCTPromiseRejectBlock
    ) {
        listenersLock.lock()
        defer { listenersLock.unlock() }
        logger?.debug(message: "getCustomSessionId")
        resolve(sessionReplay?.customSessionId ?? "-1")
    }
    
    @objc(setDeviceId:resolve:reject:)
    func setDeviceId(_ deviceId: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        logger?.debug(message: "setDeviceId: \(deviceId)")
        listenersLock.lock()
        defer { listenersLock.unlock() }
        let changed = sessionReplay.map { $0.deviceId != deviceId as String? } ?? false
        sessionReplay?.deviceId = deviceId as String?
        if changed { emitInterfaceSignal(identityChanged: true) }
        resolve(nil)
    }

    @objc(setOptOut:resolve:reject:)
    func setOptOut(_ optOut: Bool, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        listenersLock.lock()
        defer { listenersLock.unlock() }
        logger?.debug(message: "setOptOut: \(optOut)")
        sessionReplay?.optOut = optOut
        resolve(nil)
    }
    
    @objc(start:reject:)
    func start(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        listenersLock.lock()
        defer { listenersLock.unlock() }
        logger?.debug(message: "start")
        sessionReplay?.start()
        resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        listenersLock.lock()
        defer { listenersLock.unlock() }
        logger?.debug(message: "stop")
        sessionReplay?.stop()
        resolve(nil)
    }
    
    @objc(flush:reject:)
    func flush(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        listenersLock.lock()
        defer { listenersLock.unlock() }
        logger?.debug(message: "flush")
        sessionReplay?.flush()
        resolve(nil)
    }

    @objc(teardown:reject:)
    func teardown(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        listenersLock.lock()
        defer { listenersLock.unlock() }
        logger?.debug(message: "teardown")
        tearDownSessionReplay()
        resolve(nil)
    }
    
    @objc(invalidate)
    override func invalidate() {
        print("invalidate")
        listenersLock.lock()
        signalObservers = 0
        hasListeners = false
        listenersLock.unlock()
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

    @objc(observeInterfaceSignals:reject:)
    func observeInterfaceSignals(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        listenersLock.lock()
        defer { listenersLock.unlock() }
        signalObservers += 1
        resolve(emitInterfaceSignal())
    }

    @objc(stopObservingInterfaceSignals)
    func stopObservingInterfaceSignals() {
        listenersLock.lock()
        defer { listenersLock.unlock() }
        signalObservers = max(0, signalObservers - 1)
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

    @discardableResult
    private func emitInterfaceSignal(
        from receiver: RecorderSignalReceiver? = nil,
        interfaceChanged: Bool = false,
        identityChanged: Bool = false,
        isProviding: Bool? = nil,
        timestamp: Double = Date().timeIntervalSince1970 * 1000
    ) -> [String: Any]? {
        listenersLock.lock()
        defer { listenersLock.unlock() }
        if let receiver, receiver !== interfaceSignalReceiver { return nil }
        let sessionId = sessionReplay?.customSessionId ?? "-1"
        let deviceId = sessionReplay?.deviceId.flatMap { $0.isEmpty ? nil : $0 }
        let changedIdentity = identityChanged ||
            (hasReportedState && (sessionId != reportedSessionId || deviceId != reportedDeviceId))
        reportedSessionId = sessionId
        reportedDeviceId = deviceId
        hasReportedState = true
        signalSequence += 1
        let signal: [String: Any] = [
            "interfaceChanged": interfaceChanged,
            "identityChanged": changedIdentity,
            "isProviding": isProviding ?? sessionReplay?.isProviding ?? false,
            "sessionId": sessionId,
            "deviceId": deviceId as Any? ?? NSNull(),
            "timestamp": timestamp,
            "sequence": signalSequence
        ]
        if hasListeners && signalObservers > 0 {
            sendEvent(withName: "AMPNativeSessionReplayInterfaceSignal", body: signal)
        }
        return signal
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
