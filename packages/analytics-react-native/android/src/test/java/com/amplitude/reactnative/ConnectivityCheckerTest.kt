package com.amplitude.reactnative

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkInfo
import android.net.NetworkRequest
import android.os.Build
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Robolectric/JUnit4 + mockk tests for [ConnectivityChecker] — the framework-free
 * connectivity logic the JS `offline-integration.test.ts` mocks out. Mirrors the
 * pattern in Amplitude-Kotlin's `AndroidNetworkConnectivityCheckerTest`:
 * Robolectric runner + per-API-level `@Config(sdk = [...])`, mocking
 * [ConnectivityManager]/[NetworkCapabilities]/[Network] with mockk.
 *
 * The default API level for the class is M (23, the API >= 23 path); individual
 * tests override it with `@Config(sdk = [...])`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE, sdk = [Build.VERSION_CODES.M])
class ConnectivityCheckerTest {
    private val context: Context = mockk()
    private val connectivityManager: ConnectivityManager = mockk(relaxed = true)
    private val network: Network = mockk()

    // Connectivity changes delivered to the listener, in order.
    private val changes = mutableListOf<Boolean>()
    private lateinit var checker: ConnectivityChecker

    @Before
    fun setUp() {
        every { context.getSystemService(Context.CONNECTIVITY_SERVICE) } returns connectivityManager
        checker = ConnectivityChecker(context) { connected -> changes.add(connected) }
    }

    private fun capabilities(internet: Boolean, validated: Boolean): NetworkCapabilities =
        mockk {
            every { hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) } returns internet
            every { hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) } returns validated
        }

    /** Seed `currentConnectivity() == false` on API 23+ so `start()` seeds `isConnected = false`. */
    private fun seedDisconnectedApi23Plus() {
        every { connectivityManager.activeNetwork } returns null
    }

    /** Seed `currentConnectivity() == true` on API 23+. */
    private fun seedConnectedApi23Plus() {
        every { connectivityManager.activeNetwork } returns network
        every { connectivityManager.getNetworkCapabilities(network) } returns capabilities(internet = true, validated = true)
    }

    // region currentConnectivity() — API >= 23

    @Test
    fun `currentConnectivity returns true when service is not a ConnectivityManager`() {
        every { context.getSystemService(Context.CONNECTIVITY_SERVICE) } returns mockk<Any>()
        assertTrue(checker.currentConnectivity())
    }

    @Test
    fun `currentConnectivity returns false when activeNetwork is null on API 23+`() {
        every { connectivityManager.activeNetwork } returns null
        assertFalse(checker.currentConnectivity())
    }

    @Test
    fun `currentConnectivity returns false when capabilities are null on API 23+`() {
        every { connectivityManager.activeNetwork } returns network
        every { connectivityManager.getNetworkCapabilities(network) } returns null
        assertFalse(checker.currentConnectivity())
    }

    @Test
    fun `currentConnectivity returns true with INTERNET and VALIDATED on API 23+`() {
        every { connectivityManager.activeNetwork } returns network
        every { connectivityManager.getNetworkCapabilities(network) } returns capabilities(internet = true, validated = true)
        assertTrue(checker.currentConnectivity())
    }

    @Test
    fun `currentConnectivity returns false with INTERNET but not VALIDATED on API 23+ (captive portal)`() {
        every { connectivityManager.activeNetwork } returns network
        every { connectivityManager.getNetworkCapabilities(network) } returns capabilities(internet = true, validated = false)
        assertFalse(checker.currentConnectivity())
    }

    @Test
    fun `currentConnectivity returns false with neither capability on API 23+`() {
        every { connectivityManager.activeNetwork } returns network
        every { connectivityManager.getNetworkCapabilities(network) } returns capabilities(internet = false, validated = false)
        assertFalse(checker.currentConnectivity())
    }

    @Test
    fun `currentConnectivity returns true (best-effort) when the query throws`() {
        // e.g. ACCESS_NETWORK_STATE missing -> SecurityException, or a device
        // ConnectivityManager crash. Best-effort: assume online, never pin offline.
        every { connectivityManager.activeNetwork } throws SecurityException("missing ACCESS_NETWORK_STATE")
        assertTrue(checker.currentConnectivity())
    }

    // endregion

    // region currentConnectivity() — API 21–22 (deprecated activeNetworkInfo path)

    @Test
    @Config(sdk = [Build.VERSION_CODES.LOLLIPOP])
    fun `currentConnectivity uses activeNetworkInfo isConnected true on API 21-22`() {
        every { connectivityManager.activeNetworkInfo } returns mockk<NetworkInfo> { every { isConnected } returns true }
        assertTrue(checker.currentConnectivity())
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.LOLLIPOP])
    fun `currentConnectivity uses activeNetworkInfo isConnected false on API 21-22`() {
        every { connectivityManager.activeNetworkInfo } returns mockk<NetworkInfo> { every { isConnected } returns false }
        assertFalse(checker.currentConnectivity())
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.LOLLIPOP])
    fun `currentConnectivity returns false when activeNetworkInfo is null on API 21-22`() {
        every { connectivityManager.activeNetworkInfo } returns null
        assertFalse(checker.currentConnectivity())
    }

    // endregion

    // region hasInternetCapability() — API gating (commit 7173529a)

    @Test
    fun `hasInternetCapability requires INTERNET and VALIDATED on API 23+`() {
        assertTrue(checker.hasInternetCapability(capabilities(internet = true, validated = true)))
        assertFalse(checker.hasInternetCapability(capabilities(internet = true, validated = false)))
        assertFalse(checker.hasInternetCapability(capabilities(internet = false, validated = true)))
        assertFalse(checker.hasInternetCapability(capabilities(internet = false, validated = false)))
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.LOLLIPOP])
    fun `hasInternetCapability requires only INTERNET on API 21-22 (does not require VALIDATED)`() {
        // The 7173529a fix: VALIDATED is never reported on API 21-22, so requiring
        // it there would read as permanently offline. INTERNET alone must suffice.
        assertTrue(checker.hasInternetCapability(capabilities(internet = true, validated = false)))
        assertFalse(checker.hasInternetCapability(capabilities(internet = false, validated = false)))
    }

    // endregion

    // region start() — registration branch (registerDefaultNetworkCallback vs registerNetworkCallback)

    @Test
    @Config(sdk = [Build.VERSION_CODES.N])
    fun `start uses registerDefaultNetworkCallback on API 24+`() {
        seedDisconnectedApi23Plus()
        checker.start()
        verify(exactly = 1) { connectivityManager.registerDefaultNetworkCallback(any()) }
        verify(exactly = 0) {
            connectivityManager.registerNetworkCallback(any<NetworkRequest>(), any<ConnectivityManager.NetworkCallback>())
        }
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.M])
    fun `start uses registerNetworkCallback with a request on API 23`() {
        seedDisconnectedApi23Plus()
        checker.start()
        // Note: registerDefaultNetworkCallback is API 24+, so it does not exist on
        // the API 23 framework Robolectric loads here — we cannot verify(exactly=0)
        // against it (NoSuchMethodError). The positive assertion below suffices: the
        // API check in start() is mutually exclusive.
        verify(exactly = 1) {
            connectivityManager.registerNetworkCallback(any<NetworkRequest>(), any<ConnectivityManager.NetworkCallback>())
        }
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.LOLLIPOP])
    fun `start uses registerNetworkCallback with a request on API 21-22`() {
        every { connectivityManager.activeNetworkInfo } returns null // seed disconnected
        checker.start()
        verify(exactly = 1) {
            connectivityManager.registerNetworkCallback(any<NetworkRequest>(), any<ConnectivityManager.NetworkCallback>())
        }
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.N])
    fun `start is idempotent - a second call does not re-register`() {
        seedDisconnectedApi23Plus()
        checker.start()
        checker.start()
        verify(exactly = 1) { connectivityManager.registerDefaultNetworkCallback(any()) }
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.N])
    fun `start swallows SecurityException and stays unregistered`() {
        seedDisconnectedApi23Plus()
        every { connectivityManager.registerDefaultNetworkCallback(any()) } throws SecurityException("missing permission")

        checker.start() // must not throw

        // No callback was stored, so a later stop() must not try to unregister one.
        checker.stop()
        verify(exactly = 0) { connectivityManager.unregisterNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }
    }

    // endregion

    // region callback -> state mapping + dedupe

    @Test
    @Config(sdk = [Build.VERSION_CODES.N])
    fun `network callback emits only on an actual state change (dedupe)`() {
        seedDisconnectedApi23Plus() // seed isConnected = false
        val callbackSlot = slot<ConnectivityManager.NetworkCallback>()
        every { connectivityManager.registerDefaultNetworkCallback(capture(callbackSlot)) } returns Unit
        checker.start()
        val callback = callbackSlot.captured

        assertTrue(changes.isEmpty()) // start() seeds but does not emit

        // Each callback re-derives via currentConnectivity(), so drive transitions by
        // flipping the mocked active-network state, not by the event type.
        seedConnectedApi23Plus() // active network now INTERNET + VALIDATED
        callback.onAvailable(network) // false -> true
        callback.onCapabilitiesChanged(network, capabilities(internet = true, validated = true)) // true -> true: deduped

        seedDisconnectedApi23Plus() // active network gone
        callback.onLost(network) // true -> false
        callback.onLost(network) // false -> false: deduped

        assertEquals(listOf(true, false), changes)
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.N])
    fun `onCapabilitiesChanged emits online once the active network is validated on API 23+`() {
        seedDisconnectedApi23Plus()
        val callbackSlot = slot<ConnectivityManager.NetworkCallback>()
        every { connectivityManager.registerDefaultNetworkCallback(capture(callbackSlot)) } returns Unit
        checker.start()

        seedConnectedApi23Plus() // active network now INTERNET + VALIDATED
        callbackSlot.captured.onCapabilitiesChanged(network, capabilities(internet = true, validated = true))

        assertEquals(listOf(true), changes)
        assertTrue(checker.isConnected)
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.N])
    fun `onAvailable does not emit online until the network is validated (captive portal)`() {
        seedDisconnectedApi23Plus() // start offline
        val callbackSlot = slot<ConnectivityManager.NetworkCallback>()
        every { connectivityManager.registerDefaultNetworkCallback(capture(callbackSlot)) } returns Unit
        checker.start()
        val callback = callbackSlot.captured

        // Network is available but not yet VALIDATED (e.g. captive portal): onAvailable
        // must not flip JS online, or the SDK would flush into the portal.
        every { connectivityManager.activeNetwork } returns network
        every { connectivityManager.getNetworkCapabilities(network) } returns capabilities(internet = true, validated = false)
        callback.onAvailable(network)
        assertTrue(changes.isEmpty())
        assertFalse(checker.isConnected)

        // Portal sign-in completes -> the network validates -> now emit online.
        every { connectivityManager.getNetworkCapabilities(network) } returns capabilities(internet = true, validated = true)
        callback.onCapabilitiesChanged(network, capabilities(internet = true, validated = true))
        assertEquals(listOf(true), changes)
        assertTrue(checker.isConnected)
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.LOLLIPOP])
    fun `onLost stays online when another matching network is still active on API 21-22`() {
        // API 21-23 registers with registerNetworkCallback(request, ...), which reports
        // every matching network, not just the default. Losing one (e.g. Wi-Fi) must not
        // force offline while another (e.g. cellular) is still active.
        every { connectivityManager.activeNetworkInfo } returns mockk<NetworkInfo> { every { isConnected } returns true }
        val callbackSlot = slot<ConnectivityManager.NetworkCallback>()
        every { connectivityManager.registerNetworkCallback(any<NetworkRequest>(), capture(callbackSlot)) } returns Unit
        checker.start()
        assertTrue(checker.isConnected)

        callbackSlot.captured.onLost(mockk()) // a matching network dropped; activeNetworkInfo still connected
        assertTrue(changes.isEmpty())
        assertTrue(checker.isConnected)
    }

    // endregion

    // region stop() — teardown

    @Test
    @Config(sdk = [Build.VERSION_CODES.N])
    fun `stop unregisters the registered callback`() {
        seedDisconnectedApi23Plus()
        val callbackSlot = slot<ConnectivityManager.NetworkCallback>()
        every { connectivityManager.registerDefaultNetworkCallback(capture(callbackSlot)) } returns Unit
        checker.start()

        checker.stop()

        verify(exactly = 1) { connectivityManager.unregisterNetworkCallback(callbackSlot.captured) }
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.N])
    fun `stop tolerates IllegalArgumentException and clears the callback`() {
        seedDisconnectedApi23Plus()
        checker.start()
        every {
            connectivityManager.unregisterNetworkCallback(any<ConnectivityManager.NetworkCallback>())
        } throws IllegalArgumentException("callback not registered")

        checker.stop() // must not throw
        checker.stop() // second call is a no-op (callback already cleared)

        verify(exactly = 1) { connectivityManager.unregisterNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }
    }

    @Test
    fun `stop is a no-op when never started`() {
        checker.stop()
        verify(exactly = 0) { connectivityManager.unregisterNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }
    }

    // endregion

    // region desync risk — documents backlog #5

    // The module drops the emit when the React bridge is inactive
    // (hasActiveCatalystInstance() == false), but ConnectivityChecker has already
    // advanced its deduped state. This documents that a subsequent same-state
    // callback is then suppressed, so a dropped transition is not retried until a
    // *different* transition occurs. See backlog #5 in SDKRN-5-offline-followups.md.
    @Test
    @Config(sdk = [Build.VERSION_CODES.N])
    fun `dedupe advances state before delivery so a dropped change is not retried (documents desync #5)`() {
        seedConnectedApi23Plus() // isConnected = true
        val callbackSlot = slot<ConnectivityManager.NetworkCallback>()
        every { connectivityManager.registerDefaultNetworkCallback(capture(callbackSlot)) } returns Unit
        checker.start()
        assertTrue(checker.isConnected)

        seedDisconnectedApi23Plus() // active network gone -> currentConnectivity() = false
        callbackSlot.captured.onLost(network) // true -> false: listener called once
        callbackSlot.captured.onLost(network) // false -> false: deduped, listener NOT called again

        assertEquals(listOf(false), changes)
        assertFalse(checker.isConnected)
    }

    // endregion
}
