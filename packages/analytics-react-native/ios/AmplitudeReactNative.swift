import Foundation
import React

@objc(AmplitudeReactNative)
class ReactNative: NSObject {

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc
    func getApplicationContext(
        _ options: NSDictionary,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
        let trackingOptions = options as! [String: Bool]
        let trackIdfv = trackingOptions["idfv"] ?? false
        let trackCarrier = trackingOptions["carrier"] ?? false
        let appleContextProvider = AppleContextProvider(trackIdfv: trackIdfv, trackCarrier: trackCarrier)

        var applicationContext: [String: String?] = [
            "version": appleContextProvider.version,
            "platform": appleContextProvider.platform,
            "language": appleContextProvider.language,
            "country": appleContextProvider.country,
            "osName": appleContextProvider.osName,
            "osVersion": appleContextProvider.osVersion,
            "deviceManufacturer": appleContextProvider.deviceManufacturer,
            "deviceModel": appleContextProvider.deviceModel,
        ]
        if (trackIdfv) {
            applicationContext["idfv"] = appleContextProvider.idfv
        }
        if (trackCarrier) {
            applicationContext["carrier"] = appleContextProvider.carrier
        }
        resolve(applicationContext)
    }

    @objc
    func getLegacySessionData(
        _ instanceName: String?,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
        let storage = LegacyDatabaseStorage.getStorage(instanceName)
        var sessionData: [String: Any?] = [:]

        if let deviceId = storage.getValue("device_id") {
            sessionData["deviceId"] = deviceId
        }
        if let userId = storage.getValue("user_id") {
            sessionData["userId"] = userId
        }
        if let previousSessionId = storage.getLongValue("previous_session_id") {
            sessionData["sessionId"] = previousSessionId
        }
        if let lastEventTime = storage.getLongValue("previous_session_time") {
            sessionData["lastEventTime"] = lastEventTime
        }
        if let lastEventId = storage.getLastEventId() {
            sessionData["lastEventId"] = lastEventId
        }
        resolve(sessionData)
    }

    @objc
    func getLegacyEvents(
        _ instanceName: String?,
        eventKind: String,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
        let storage = LegacyDatabaseStorage.getStorage(instanceName)
        var events: [[String: Any]] = []
        switch eventKind {
        case "event":
            events = storage.readEvents()
        case "identify":
            events = storage.readIdentifies()
        case "interceptedIdentify":
            events = storage.readInterceptedIdentifies()
        default:
            break
        }
        var jsonEvents: [String] = []
        events.forEach { event in
            if let jsonEvent = try? JSONSerialization.data(withJSONObject: event) {
                jsonEvents.append(String(decoding: jsonEvent, as: UTF8.self))
            }
        }
        resolve(jsonEvents)
    }

    @objc
    func removeLegacyEvent(
        _ instanceName: String?,
        eventKind: String,
        eventId: Double
    ) -> Void {
        let storage = LegacyDatabaseStorage.getStorage(instanceName)
        switch eventKind {
        case "event":
            storage.removeEvent(Int64(eventId))
        case "identify":
            storage.removeIdentify(Int64(eventId))
        case "interceptedIdentify":
            storage.removeInterceptedIdentify(Int64(eventId))
        default:
            break
        }
    }
}
