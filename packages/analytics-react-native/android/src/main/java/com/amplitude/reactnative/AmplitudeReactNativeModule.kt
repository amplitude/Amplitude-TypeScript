package com.amplitude.reactnative

import com.facebook.react.bridge.Promise
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap

const val MODULE_NAME = "AmplitudeReactNative"

@ReactModule(name = MODULE_NAME)
class AmplitudeReactNativeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val DEVICE_ID_KEY = "device_id"
        const val USER_ID_KEY = "user_id"
        const val LAST_EVENT_TIME_KEY = "last_event_time"
        const val LAST_EVENT_ID_KEY = "last_event_id"
        const val PREVIOUS_SESSION_ID_KEY = "previous_session_id"
    }

    private var androidContextProvider: AndroidContextProvider? = null

    override fun getName(): String {
        return MODULE_NAME
    }

    @ReactMethod
    private fun getApplicationContext(options: ReadableMap, promise: Promise) {
        val trackAdid = if (options.hasKey("adid")) options.getBoolean("adid") else false
        if (androidContextProvider == null) {
            androidContextProvider = AndroidContextProvider(reactContext.applicationContext, false, trackAdid)
        }

        promise.resolve(WritableNativeMap().apply {
            putString("version", androidContextProvider!!.versionName)
            putString("platform", androidContextProvider!!.platform)
            putString("language", androidContextProvider!!.language)
            putString("osName", androidContextProvider!!.osName)
            putString("osVersion", androidContextProvider!!.osVersion)
            putString("deviceBrand", androidContextProvider!!.brand)
            putString("deviceManufacturer", androidContextProvider!!.manufacturer)
            putString("deviceModel", androidContextProvider!!.model)
            putString("carrier", androidContextProvider!!.carrier)
            if (trackAdid) {
                putString("adid", androidContextProvider!!.advertisingId)
            }
            putString("appSetId", androidContextProvider!!.appSetId)
        })
    }

    @ReactMethod
    private fun getLegacySessionData(instanceName: String?, promise: Promise) {
        val storage = LegacyDatabaseStorageProvider.getStorage(reactContext.applicationContext, instanceName)
        val deviceId = storage.getValue(DEVICE_ID_KEY)
        val userId = storage.getValue(USER_ID_KEY)
        val previousSessionId = storage.getLongValue(PREVIOUS_SESSION_ID_KEY)
        val lastEventTime = storage.getLongValue(LAST_EVENT_TIME_KEY)
        val lastEventId = storage.getLongValue(LAST_EVENT_ID_KEY)
        promise.resolve(WritableNativeMap().apply {
            if (deviceId != null) {
                putString("deviceId", deviceId)
            }
            if (userId != null) {
                putString("userId", userId)
            }
            if (previousSessionId != null) {
                putDouble("sessionId", previousSessionId.toDouble())
            }
            if (lastEventTime != null) {
                putDouble("lastEventTime", lastEventTime.toDouble())
            }
            if (lastEventId != null) {
                putDouble("lastEventId", lastEventId.toDouble())
            }
        })
    }

    @ReactMethod
    private fun getLegacyEvents(instanceName: String?, promise: Promise) {
        val storage = LegacyDatabaseStorageProvider.getStorage(reactContext.applicationContext, instanceName)
        val jsonEvents = storage.readEventsContent()

        val events = WritableNativeArray()
        jsonEvents.forEach { event -> events.pushString(event.toString()) }
        promise.resolve(events)
    }

    @ReactMethod
    private fun getLegacyIdentifies(instanceName: String?, promise: Promise) {
        val storage = LegacyDatabaseStorageProvider.getStorage(reactContext.applicationContext, instanceName)
        val jsonEvents = storage.readIdentifiesContent()

        val events = WritableNativeArray()
        jsonEvents.forEach { event -> events.pushString(event.toString()) }
        promise.resolve(events)
    }

    @ReactMethod
    private fun getLegacyInterceptedIdentifies(instanceName: String?, promise: Promise) {
        val storage = LegacyDatabaseStorageProvider.getStorage(reactContext.applicationContext, instanceName)
        val jsonEvents = storage.readInterceptedIdentifiesContent()

        val events = WritableNativeArray()
        jsonEvents.forEach { event -> events.pushString(event.toString()) }
        promise.resolve(events)
    }

    @ReactMethod
    private fun removeLegacyEvent(instanceName: String?, eventId: Long) {
        val storage = LegacyDatabaseStorageProvider.getStorage(reactContext.applicationContext, instanceName)
        storage.removeEvent(eventId)
    }

    @ReactMethod
    private fun removeLegacyIdentify(instanceName: String?, eventId: Long) {
        val storage = LegacyDatabaseStorageProvider.getStorage(reactContext.applicationContext, instanceName)
        storage.removeIdentify(eventId)
    }

    @ReactMethod
    private fun removeLegacyInterceptedIdentify(instanceName: String?, eventId: Long) {
        val storage = LegacyDatabaseStorageProvider.getStorage(reactContext.applicationContext, instanceName)
        storage.removeInterceptedIdentify(eventId)
    }
}
