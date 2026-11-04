import Foundation
import React
import AmplitudeSessionReplay
import AmplitudeCore

@objc(PluginSessionReplayReactNative)
class PluginSessionReplayReactNative: RCTEventEmitter, @unchecked Sendable {
    
    var sessionReplay: SessionReplay!
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
        private weak var owner: PluginSessionReplayReactNative?

        init(owner: PluginSessionReplayReactNative) {
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
        listenersLock.lock()
        defer { listenersLock.unlock() }
        tearDownSessionReplay()
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
        let receiver = RecorderSignalReceiver(owner: self)
        listenersLock.lock()
        interfaceSignalReceiver = receiver
        listenersLock.unlock()
        sessionReplay.addInterfaceSignalReceiver(receiver)
        if (autoStart) {
            sessionReplay.start()
        }
        emitInterfaceSignal()
        resolve(nil)
    }
    
    @objc(setSessionId:resolve:reject:)
    func setSessionId(_ sessionId: NSNumber, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
      print("setSessionId: \(sessionId)")
      listenersLock.lock()
      defer { listenersLock.unlock() }
      let changed = sessionReplay.map { $0.sessionId != sessionId.int64Value } ?? false
      sessionReplay?.sessionId = sessionId.int64Value
      if changed { emitInterfaceSignal(identityChanged: true) }
      resolve(nil)
    }

    @objc(getSessionId:reject:)
    func getSessionId(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        listenersLock.lock()
        defer { listenersLock.unlock() }
      print("getSessionId")
      resolve(NSNumber(value: sessionReplay?.sessionId ?? -1))
    }
    
    @objc(getSessionReplayProperties:reject:)
    func getSessionReplayProperties(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        listenersLock.lock()
        defer { listenersLock.unlock() }
      print("getSessionReplayProperties")
      resolve(sessionReplay?.additionalEventProperties ?? [:])
    }
    
    @objc(start:reject:)
    func start(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        listenersLock.lock()
        defer { listenersLock.unlock() }
      print("start")
      sessionReplay?.start()
      resolve(nil)
    }
    
    @objc(stop:reject:)
    func stop(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        listenersLock.lock()
        defer { listenersLock.unlock() }
      print("stop")
      sessionReplay?.stop()
      resolve(nil)
    }
    
    @objc(flush:reject:)
    func flush(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        listenersLock.lock()
        defer { listenersLock.unlock() }
      print("flush")
      sessionReplay?.flush()
      resolve(nil)
    }
    
    @objc(teardown:reject:)
    func teardown(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        listenersLock.lock()
        defer { listenersLock.unlock() }
        print("teardown")
        tearDownSessionReplay()
        resolve(nil)
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

    override func invalidate() {
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
    }

    override func supportedEvents() -> [String]! {
        ["PluginSessionReplayReactNativeInterfaceSignal"]
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
        let sessionId = sessionReplay.map { String($0.sessionId) } ?? "-1"
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
            sendEvent(withName: "PluginSessionReplayReactNativeInterfaceSignal", body: signal)
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
