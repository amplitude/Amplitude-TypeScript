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
        let appleContextProvider = AppleContextProvider(trackIdfv: trackIdfv)

        var applicationContext: [String: String?] = [
            "version": appleContextProvider.version,
            "platform": appleContextProvider.platform,
            "language": appleContextProvider.language,
            "osName": appleContextProvider.osName,
            "osVersion": appleContextProvider.osVersion,
            "deviceManufacturer": appleContextProvider.deviceManufacturer,
            "deviceModel": appleContextProvider.deviceModel,
        ]
        if (trackIdfv) {
            applicationContext["idfv"] = appleContextProvider.idfv
        }
        resolve(applicationContext)
    }

    @objc
    func getLegacySessionData(
        _ instanceName: String?,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
        let storage = LegacyDatabaseStorager.getStorage(instanceName, nil)
        var sessionData: [String: Any?] = [:]

        if let deviceId = storage.getValue("device_id") {
            sessionData["deviceId"] = deviceId
        }
        if let userId = storage.getValue("user_id") {
            sessionData["userId"] = userId
        }
        if let previousSessionId = storage.getValue("previous_session_id") {
            sessionData["sessionId"] = previousSessionId
        }
        if let lastEventTime = storage.getValue("previous_session_time") {
            sessionData["lastEventTime"] = lastEventTime
        }
        resolve(sessionData)
    }

    @objc
    func getLegacyEvents(
        _ instanceName: String?,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
        let storage = LegacyDatabaseStorager.getStorage(instanceName, nil)
        let events = storage.readEvents()
        resolve(events)
    }

    @objc
    func getLegacyIdentifies(
        _ instanceName: String?,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
        let storage = LegacyDatabaseStorager.getStorage(instanceName, nil)
        let events = storage.readIdentifies()
        resolve(events)
    }

    @objc
    func getLegacyInterceptedIdentifies(
        _ instanceName: String?,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
        let storage = LegacyDatabaseStorager.getStorage(instanceName, nil)
        let events = storage.readInterceptedIdentifies()
        resolve(events)
    }

    @objc
    func removeValue(
        _ instanceName: String?,
        key: String,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
        let storage = LegacyDatabaseStorager.getStorage(instanceName, nil)
        switch key {
        case "deviceId":
            storage.removeValue("device_id")
        case "userId":
            storage.removeValue("user_id")
        case "sessionId":
            storage.removeLongValue("previous_session_id")
        case "lastEventTime":
            storage.removeLongValue("previous_session_time")
        default:
            break
        }
        resolve()
    }

    @objc
    func removeLegacyEvent(
        _ instanceName: String?,
        rowId: Int64,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
        let storage = LegacyDatabaseStorager.getStorage(instanceName, nil)
        storage.removeEvent(rowId)
        resolve()
    }

    @objc
    func removeLegacyIdentify(
        _ instanceName: String?,
        rowId: Int64,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
        let storage = LegacyDatabaseStorager.getStorage(instanceName, nil)
        storage.removeIdentify(rowId)
        resolve()
    }

    @objc
    func removeLegacyInterceptedIdentify(
        _ instanceName: String?,
        rowId: Int64,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
        let storage = LegacyDatabaseStorager.getStorage(instanceName, nil)
        storage.removeInterceptedIdentify(rowId)
        resolve()
    }
}
