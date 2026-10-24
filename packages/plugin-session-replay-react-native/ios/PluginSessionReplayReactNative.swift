import Foundation
import AmplitudeSessionReplay
import AmplitudeCore

@objc(PluginSessionReplayReactNative)
class PluginSessionReplayReactNative: NSObject {
    
    var sessionReplay: SessionReplay!
    @objc var methodQueue: DispatchQueue { DispatchQueue.main }
    private var signalReceiver = ReplayInterfaceSignalReceiver()
    
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
        sessionReplay?.removeInterfaceSignalReceiver(signalReceiver)
        signalReceiver = ReplayInterfaceSignalReceiver(generation: signalReceiver.nextGeneration())
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
        sessionReplay.addInterfaceSignalReceiver(signalReceiver)
        if (autoStart) {
            sessionReplay.start()
        }
        resolve(nil)
    }
    
    @objc(setSessionId:resolve:reject:)
    func setSessionId(_ sessionId: NSNumber, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
      if sessionReplay.sessionId != sessionId.int64Value { signalReceiver.invalidate() }
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
      signalReceiver.invalidate()
      print("start")
      sessionReplay.start()
      resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
      signalReceiver.invalidate()
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
      signalReceiver.invalidate()
      sessionReplay?.removeInterfaceSignalReceiver(signalReceiver)
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
            var state = self.signalReceiver.snapshot()
            state["isProviding"] = self.sessionReplay?.isProviding ?? false
            state["sessionId"] = self.sessionReplay.map { String($0.sessionId) } ?? "-1"
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
