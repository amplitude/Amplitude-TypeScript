import Foundation
import AmplitudeSessionReplay
import AmplitudeCore

@objc(AMPNativeSessionReplay)
class NativeSessionReplay: NSObject, RCTBridgeModule {
    static func moduleName() -> String! {
        "AMPNativeSessionReplay"
    }
    
    var sessionReplay: SessionReplay?
    var logger: CoreLogger?
    private var signalReceiver = ReplayInterfaceSignalReceiver()
    
    override init() {
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
        sessionReplay?.addInterfaceSignalReceiver(signalReceiver)

        resolve(nil)
    }
    
    @objc(setCustomSessionId:resolve:reject:)
    func setCustomSessionId(_ customSessionId: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        if sessionReplay?.customSessionId != customSessionId as String {
            signalReceiver.invalidate()
        }
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
        if sessionReplay?.deviceId != deviceId as String? {
            signalReceiver.invalidate()
        }
        logger?.debug(message: "setDeviceId: \(deviceId)")
        sessionReplay?.deviceId = deviceId as String?
        resolve(nil)
    }

    @objc(setOptOut:resolve:reject:)
    func setOptOut(_ optOut: Bool, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        signalReceiver.invalidate()
        logger?.debug(message: "setOptOut: \(optOut)")
        sessionReplay?.optOut = optOut
        resolve(nil)
    }
    
    @objc(start:reject:)
    func start(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        signalReceiver.invalidate()
        logger?.debug(message: "start")
        sessionReplay?.start()
        resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        signalReceiver.invalidate()
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
    func invalidate() {
        print("invalidate")
        tearDownSessionReplay()
    }

    private func tearDownSessionReplay() {
        signalReceiver.invalidate()
        sessionReplay?.removeInterfaceSignalReceiver(signalReceiver)
        // Queued callbacks from the old recorder must not change the new state.
        signalReceiver = ReplayInterfaceSignalReceiver(generation: signalReceiver.nextGeneration())
        sessionReplay?.stop()
        sessionReplay = nil
        logger = nil
    }

    @objc(getInterfaceSignalState:reject:)
    func getInterfaceSignalState(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        // Replay updates capture availability on the main queue.
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                resolve(["isProviding": false])
                return
            }
            var state = self.signalReceiver.snapshot()
            state["isProviding"] = self.sessionReplay?.isProviding ?? false
            state["sessionId"] = self.sessionReplay?.customSessionId ?? "-1"
            state["deviceId"] = self.sessionReplay?.deviceId as Any? ?? NSNull()
            resolve(state)
        }
    }
}

private final class ReplayInterfaceSignalReceiver: NSObject, InterfaceSignalReceiver, @unchecked Sendable {
    private let lock = NSLock()
    private var generation = 0
    private var lastChangeTime: Double = 0

    init(generation: Int = 0) {
        self.generation = generation
        super.init()
    }

    func nextGeneration() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return generation + 1
    }

    func onInterfaceChanged(signal: InterfaceChangeSignal) {
        lock.lock()
        lastChangeTime = max(lastChangeTime, signal.time.timeIntervalSince1970 * 1000)
        lock.unlock()
    }

    func onStartProviding() { invalidate() }
    func onStopProviding() { invalidate() }

    func invalidate() {
        lock.lock()
        generation += 1
        lock.unlock()
    }

    func snapshot() -> [String: Any] {
        lock.lock()
        defer { lock.unlock() }
        return ["generation": generation, "lastChangeTime": lastChangeTime]
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
