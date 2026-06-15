package com.amplitude.reactnative

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.slot
import io.mockk.unmockkStatic
import io.mockk.verify
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Thin-bridge tests for [AmplitudeReactNativeConnectivityModule] — the React
 * glue that the framework-free [ConnectivityChecker] (covered separately in
 * [ConnectivityCheckerTest]) delegates from. Covers the two behaviors that need
 * the React surface: [AmplitudeReactNativeConnectivityModule.getNetworkConnectivityStatus]
 * resolving a promise, and the `hasActiveCatalystInstance()` emit guard.
 *
 * `Arguments.createMap()` is static-mocked to a [JavaOnlyMap] (the pure-Java
 * WritableMap) since the native map factory isn't installed in unit tests.
 */
@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE, sdk = [Build.VERSION_CODES.N])
class AmplitudeReactNativeConnectivityModuleTest {
    private val reactContext: ReactApplicationContext = mockk(relaxed = true)
    private val connectivityManager: ConnectivityManager = mockk(relaxed = true)
    private val emitter: RCTDeviceEventEmitter = mockk(relaxed = true)
    private val network: Network = mockk()
    private lateinit var module: AmplitudeReactNativeConnectivityModule

    @Before
    fun setUp() {
        mockkStatic(Arguments::class)
        every { Arguments.createMap() } answers { JavaOnlyMap() }
        every { reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) } returns connectivityManager
        every { reactContext.getJSModule(RCTDeviceEventEmitter::class.java) } returns emitter
        module = AmplitudeReactNativeConnectivityModule(reactContext)
    }

    @After
    fun tearDown() {
        unmockkStatic(Arguments::class)
    }

    private fun caps(internet: Boolean, validated: Boolean): NetworkCapabilities =
        mockk {
            every { hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) } returns internet
            every { hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) } returns validated
        }

    @Test
    fun `getNetworkConnectivityStatus resolves isConnected true when connected`() {
        every { connectivityManager.activeNetwork } returns network
        every { connectivityManager.getNetworkCapabilities(network) } returns caps(internet = true, validated = true)
        val promise = mockk<Promise>(relaxed = true)
        val resultSlot = slot<WritableMap>()

        module.getNetworkConnectivityStatus(promise)

        verify { promise.resolve(capture(resultSlot)) }
        assertTrue(resultSlot.captured.getBoolean("isConnected"))
    }

    @Test
    fun `getNetworkConnectivityStatus resolves isConnected false when disconnected`() {
        every { connectivityManager.activeNetwork } returns null
        val promise = mockk<Promise>(relaxed = true)
        val resultSlot = slot<WritableMap>()

        module.getNetworkConnectivityStatus(promise)

        verify { promise.resolve(capture(resultSlot)) }
        assertFalse(resultSlot.captured.getBoolean("isConnected"))
    }

    @Test
    fun `emits connectivity change event when catalyst instance is active`() {
        every { reactContext.hasActiveCatalystInstance() } returns true
        every { connectivityManager.activeNetwork } returns null // seed disconnected
        val callbackSlot = slot<ConnectivityManager.NetworkCallback>()
        every { connectivityManager.registerDefaultNetworkCallback(capture(callbackSlot)) } returns Unit

        module.addListener("AmplitudeNetworkConnectivityChanged")

        // Active network becomes validated -> the callback re-derives online via
        // currentConnectivity(), so the false -> true transition emits.
        every { connectivityManager.activeNetwork } returns network
        every { connectivityManager.getNetworkCapabilities(network) } returns caps(internet = true, validated = true)
        callbackSlot.captured.onAvailable(network) // false -> true: should emit

        val payloadSlot = slot<WritableMap>()
        verify(exactly = 1) { emitter.emit("AmplitudeNetworkConnectivityChanged", capture(payloadSlot)) }
        assertTrue(payloadSlot.captured.getBoolean("isConnected"))
    }

    @Test
    fun `removeListeners is a no-op and does not unregister the callback`() {
        every { connectivityManager.activeNetwork } returns null // seed disconnected
        every { connectivityManager.registerDefaultNetworkCallback(any()) } returns Unit
        module.addListener("AmplitudeNetworkConnectivityChanged")

        module.removeListeners(1)

        verify(exactly = 0) { connectivityManager.unregisterNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }
    }

    // Backlog #5: the emit is dropped when the bridge is inactive, but the
    // checker's deduped state has already advanced — so JS can desync until a
    // different transition. This documents the current drop behavior.
    @Test
    fun `drops connectivity emit when catalyst instance is inactive (documents desync #5)`() {
        every { reactContext.hasActiveCatalystInstance() } returns false
        every { connectivityManager.activeNetwork } returns null // seed disconnected
        val callbackSlot = slot<ConnectivityManager.NetworkCallback>()
        every { connectivityManager.registerDefaultNetworkCallback(capture(callbackSlot)) } returns Unit

        module.addListener("AmplitudeNetworkConnectivityChanged")

        // A real offline -> online transition occurs (active network validates), but the
        // bridge is inactive, so the emit must be dropped (not merely deduped away).
        every { connectivityManager.activeNetwork } returns network
        every { connectivityManager.getNetworkCapabilities(network) } returns caps(internet = true, validated = true)
        callbackSlot.captured.onAvailable(network) // state advances, but emit is dropped

        verify(exactly = 0) { reactContext.getJSModule(RCTDeviceEventEmitter::class.java) }
        verify(exactly = 0) { emitter.emit(any(), any()) }
    }
}
