package com.amplitude.reactnative

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
<<<<<<< sdkrn-5-offline-4-android
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

=======
import com.facebook.react.module.annotations.ReactModule

const val CONNECTIVITY_MODULE_NAME = "AmplitudeReactNativeConnectivity"

/**
 * No-op placeholder for the connectivity native module, bridged back to JS as
 * [CONNECTIVITY_MODULE_NAME]. It exists so the JS
 * `networkConnectivityCheckerPlugin` can bind to a real native module and seed
 * an initial "online" state; it never reports going offline.
 *
 * Real `ConnectivityManager` monitoring is added in a follow-up PR that replaces
 * this file. Until then, offline mode is a no-op on Android —
 * [getNetworkConnectivityStatus] always reports connected, so the SDK never
 * wrongly suppresses sends.
 */
@ReactModule(name = CONNECTIVITY_MODULE_NAME)
class AmplitudeReactNativeConnectivityModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

>>>>>>> main
    override fun getName(): String {
        return CONNECTIVITY_MODULE_NAME
    }

<<<<<<< sdkrn-5-offline-4-android
    private var listenerCount = 0

    @ReactMethod
    fun addListener(eventName: String) {
        if (eventName != CONNECTIVITY_EVENT_NAME) {
            return
        }
        if (listenerCount == 0) {
            connectivityChecker.start()
        }
        listenerCount += 1
=======
    // Required so `NativeEventEmitter` doesn't warn on the JS side.
    @ReactMethod
    fun addListener(eventName: String) {
        // No-op placeholder.
>>>>>>> main
    }

    @ReactMethod
    fun removeListeners(count: Int) {
<<<<<<< sdkrn-5-offline-4-android
        listenerCount = (listenerCount - count).coerceAtLeast(0)
        if (listenerCount == 0) {
            connectivityChecker.stop()
        }
    }

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
=======
        // No-op placeholder.
    }

    /**
     * JS reads this once on setup to seed the initial `offline` value. The
     * placeholder always reports connected.
     */
    @ReactMethod
    fun getNetworkConnectivityStatus(promise: Promise) {
        promise.resolve(Arguments.createMap().apply { putBoolean("isConnected", true) })
>>>>>>> main
    }
}
