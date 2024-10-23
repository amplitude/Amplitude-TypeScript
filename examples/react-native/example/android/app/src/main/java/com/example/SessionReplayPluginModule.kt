package com.example

import com.amplitude.android.sessionreplay.SessionReplay
import com.amplitude.common.Logger
import com.amplitude.common.android.LogcatLogger
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeMap

class SessionReplayPluginModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
    private lateinit var sessionReplay: SessionReplay

    override fun getName(): String {
        return "SessionReplayPluginModule"
    }

    @ReactMethod
    fun setup(apiKey: String, deviceId: String?, sessionId: Double) {
        LogcatLogger.logger.logMode = Logger.LogMode.DEBUG
        sessionReplay = SessionReplay(
            apiKey,
            reactContext.applicationContext,
            deviceId ?: "",
            sessionId.toLong(),
            logger = LogcatLogger.logger,
            sampleRate = 1.0,
            enableRemoteConfig = false,
        )
    }

    @ReactMethod
    fun setSessionId(sessionId: Double) {
        sessionReplay.setSessionId(sessionId.toLong())
    }

    @ReactMethod
    fun getSessionId(promise: Promise) {
        promise.resolve(sessionReplay.getSessionId().toDouble())
    }

    @ReactMethod
    fun getSessionReplayProperties(promise: Promise) {
        val properties: Map<String, Any> = sessionReplay.getSessionReplayProperties()
        val map: WritableMap = WritableNativeMap()
        for ((key, value) in properties) {
            if (value is String) {
                map.putString(key, value)
            } else if (value is Int) {
                map.putInt(key, value)
            } else if (value is Long) {
                map.putDouble(key, value.toDouble())
            } else if (value is Double) {
                map.putDouble(key, value)
            } else if (value is Boolean) {
                map.putBoolean(key, value)
            }
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun flush() {
        sessionReplay.flush()
    }

    @ReactMethod
    fun teardown() {
        sessionReplay.shutdown()
    }

    override fun invalidate() {
        sessionReplay.shutdown()
    }
}
