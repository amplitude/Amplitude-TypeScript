package com.amplitude.reactnative

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule

const val CONNECTIVITY_MODULE_NAME = "AmplitudeReactNativeConnectivity"
private const val CONNECTIVITY_EVENT_NAME = "AmplitudeNetworkConnectivityChanged"

/**
 * Connectivity-only native module bridged back to JS as
 * [CONNECTIVITY_MODULE_NAME].
 *
 * The Android networking logic lives in the framework-free [ConnectivityChecker]
 * (so it can be unit-tested without React Native on the classpath); this module
 * is the thin React bridge around it — it seeds JS via [getNetworkConnectivityStatus]
 * and forwards connectivity changes as [CONNECTIVITY_EVENT_NAME] events.
 */
@ReactModule(name = CONNECTIVITY_MODULE_NAME)
class AmplitudeReactNativeConnectivityModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val connectivityChecker = ConnectivityChecker(reactContext) { connected ->
        emitConnectivityChange(connected)
    }

    override fun getName(): String {
        return CONNECTIVITY_MODULE_NAME
    }

    private var listenerCount = 0

    // Required so `NativeEventEmitter` doesn't warn on the JS side. Registration
    // is lazy and starts on the first listener (see [ConnectivityChecker.start]).
    @ReactMethod
    fun addListener(eventName: String) {
        if (listenerCount == 0) {
            connectivityChecker.start()
        }
        listenerCount += 1
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        listenerCount = (listenerCount - count).coerceAtLeast(0)
        if (listenerCount == 0) {
            connectivityChecker.stop()
        }
    }

    /**
     * Returns the current connectivity state. The network callback only fires on
     * subsequent changes, so JS reads this once on setup to seed the initial
     * `offline` value.
     */
    @ReactMethod
    fun getNetworkConnectivityStatus(promise: Promise) {
        promise.resolve(Arguments.createMap().apply { putBoolean("isConnected", connectivityChecker.currentConnectivity()) })
    }

    private fun emitConnectivityChange(connected: Boolean) {
        if (!reactContext.hasActiveCatalystInstance()) {
            return
        }
        val params: WritableMap = Arguments.createMap().apply { putBoolean("isConnected", connected) }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(CONNECTIVITY_EVENT_NAME, params)
    }

    override fun invalidate() {
        connectivityChecker.stop()
        super.invalidate()
    }
}
