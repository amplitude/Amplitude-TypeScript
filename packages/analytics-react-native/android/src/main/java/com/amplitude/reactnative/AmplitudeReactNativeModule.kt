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
            androidContextProvider = AndroidContextProvider(reactContext.applicationContext, trackAdid)
        }

        promise.resolve(WritableNativeMap().apply {
            putString("version", androidContextProvider!!.versionName)
            putString("platform", androidContextProvider!!.platform)
            putString("language", androidContextProvider!!.language)
            putString("country", androidContextProvider!!.country)
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
        try {
            val storage = LegacyDatabaseStorageProvider.getStorage(reactContext.applicationContext, instanceName)
            val deviceId = getLegacyValue(storage, DEVICE_ID_KEY)
            val userId = getLegacyValue(storage, USER_ID_KEY)
            val previousSessionId = getLegacyLongValue(storage, PREVIOUS_SESSION_ID_KEY)
            val lastEventTime = getLegacyLongValue(storage, LAST_EVENT_TIME_KEY)
            val lastEventId = getLegacyLongValue(storage, LAST_EVENT_ID_KEY)
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
        } catch (e: Exception) {
            LogcatLogger.logger.error(
                "can't get legacy session data: $e"
            )
        }
    }

    private fun getLegacyValue(storage: LegacyDatabaseStorage, key: String): String? {
        try {
            return storage.getValue(key)
        } catch (e: Exception) {
            LogcatLogger.logger.error(
                "can't get legacy $key: $e"
            )
            return null
        }
    }

    private fun getLegacyLongValue(storage: LegacyDatabaseStorage, key: String): Long? {
        try {
            return storage.getLongValue(key)
        } catch (e: Exception) {
            LogcatLogger.logger.error(
                "can't get legacy $key: $e"
            )
            return null
        }
    }

    @ReactMethod
    private fun getLegacyEvents(instanceName: String?, eventKind: String, promise: Promise) {
        try {
            val storage = LegacyDatabaseStorageProvider.getStorage(reactContext.applicationContext, instanceName)
            val jsonEvents = when (eventKind) {
                "event" -> storage.readEvents()
                "identify" -> storage.readIdentifies()
                "interceptedIdentify" -> storage.readInterceptedIdentifies()
                else -> listOf()
            }

            val events = WritableNativeArray()
            jsonEvents.forEach { event -> events.pushString(event.toString()) }
            promise.resolve(events)
        } catch (e: Exception) {
            LogcatLogger.logger.error(
                "can't get legacy ${eventKind}s: $e"
            )
            promise.resolve(WritableNativeArray())
        }
    }

    @ReactMethod
    private fun removeLegacyEvent(instanceName: String?, eventKind: String, eventId: Int) {
        try {
            val storage = LegacyDatabaseStorageProvider.getStorage(reactContext.applicationContext, instanceName)
            when (eventKind) {
                "event" -> storage.removeEvent(eventId)
                "identify" -> storage.removeIdentify(eventId)
                "interceptedIdentify" -> storage.removeInterceptedIdentify(eventId)
            }
        } catch (e: Exception) {
            LogcatLogger.logger.error(
                "can't remove legacy $eventKind with id=$eventId: $e"
            )
        }
    }
}
