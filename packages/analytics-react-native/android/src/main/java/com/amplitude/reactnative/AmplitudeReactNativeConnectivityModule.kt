package com.amplitude.reactnative

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
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

    override fun getName(): String {
        return CONNECTIVITY_MODULE_NAME
    }

    // Required so `NativeEventEmitter` doesn't warn on the JS side.
    @ReactMethod
    fun addListener(eventName: String) {
        // No-op placeholder.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // No-op placeholder.
    }

    /**
     * JS reads this once on setup to seed the initial `offline` value. The
     * placeholder always reports connected.
     */
    @ReactMethod
    fun getNetworkConnectivityStatus(promise: Promise) {
        promise.resolve(Arguments.createMap().apply { putBoolean("isConnected", true) })
    }
}
