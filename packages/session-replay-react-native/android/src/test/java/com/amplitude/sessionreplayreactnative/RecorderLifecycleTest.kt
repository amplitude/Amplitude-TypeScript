package com.amplitude.sessionreplayreactnative

import android.content.Context
import com.amplitude.android.sessionreplay.SessionReplay
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test
import org.mockito.Mockito.*

class RecorderLifecycleTest {
  private fun module(): SessionReplayReactNativeModule {
    val context = mock(ReactApplicationContext::class.java)
    `when`(context.applicationContext).thenReturn(mock(Context::class.java))
    return SessionReplayReactNativeModule(context)
  }

  private fun config(): ReadableMap = mock(ReadableMap::class.java).apply {
    `when`(getString("apiKey")).thenReturn("api-key")
    `when`(getString("customSessionId")).thenReturn("session")
    `when`(getDouble("sampleRate")).thenReturn(1.0)
  }

  @Test
  fun failedSetupPreservesTheWorkingRecorderAndConfig() {
    val module = module()
    mockConstruction(SessionReplay::class.java) { recorder, construction ->
      if (construction.count == 2) throw IllegalStateException("construction failed")
      `when`(recorder.shouldRecord()).thenReturn(true)
    }.use { construction ->
      module.setup(config(), mock(Promise::class.java))
      module.start(mock(Promise::class.java))
      val original = construction.constructed().single()
      val replacementConfig = config().apply {
        `when`(getString("customSessionId")).thenReturn("replacement")
      }
      val failure = mock(Promise::class.java)
      module.setup(replacementConfig, failure)
      verify(failure).reject(eq("SETUP_ERROR"), anyString(), any(Exception::class.java))
      verify(original, never()).shutdown()
      val promise = mock(Promise::class.java)
      module.isRecording(promise)
      verify(promise).resolve(true)
      // If the failed config leaked, this setter would use "replacement".
      module.setOptOut(true, mock(Promise::class.java))
      module.setOptOut(false, mock(Promise::class.java))
      verify(construction.constructed().last()).setCustomSessionId("session")
    }
  }

  @Test
  fun invalidatedModuleIgnoresSetupOptOutAndStart() {
    val module = module()
    module.invalidate()
    mockConstruction(SessionReplay::class.java).use { construction ->
      val promise = mock(Promise::class.java)
      module.setup(config(), promise)
      module.setOptOut(false, promise)
      module.start(promise)
      assertTrue(construction.constructed().isEmpty())
      verify(promise, times(3)).resolve(null)
      module.isRecording(promise)
      verify(promise).resolve(false)
    }
  }

  @Test
  fun invalidationWaitsForSetupConstruction() {
    assertInvalidationSerializesWithConstruction(restartFromOptOut = false)
  }

  @Test
  fun invalidationWaitsForOptOutReconstructionAndStopsTheRecorder() {
    assertInvalidationSerializesWithConstruction(restartFromOptOut = true)
  }

  private fun assertInvalidationSerializesWithConstruction(restartFromOptOut: Boolean) {
    val module = module()
    if (restartFromOptOut) {
      val optedOut = config().apply { `when`(getBoolean("optOut")).thenReturn(true) }
      module.setup(optedOut, mock(Promise::class.java))
      module.start(mock(Promise::class.java))
    }
    val constructing = CountDownLatch(1)
    val release = CountDownLatch(1)
    val invalidating = CountDownLatch(1)
    val recorder = AtomicReference<SessionReplay>()
    val failure = AtomicReference<Throwable>()
    val setupThread = Thread {
      try {
        mockConstruction(SessionReplay::class.java) { next, _ ->
          recorder.set(next)
          constructing.countDown()
          check(release.await(5, TimeUnit.SECONDS))
        }.use {
          if (restartFromOptOut) module.setOptOut(false, mock(Promise::class.java))
          else module.setup(config(), mock(Promise::class.java))
        }
      } catch (error: Throwable) { failure.set(error) }
    }
    val invalidationThread = Thread {
      invalidating.countDown()
      module.invalidate()
    }
    setupThread.start()
    try {
      assertTrue(constructing.await(5, TimeUnit.SECONDS))
      invalidationThread.start()
      assertTrue(invalidating.await(5, TimeUnit.SECONDS))
      val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
      while (invalidationThread.isAlive && invalidationThread.state != Thread.State.BLOCKED &&
        System.nanoTime() < deadline) Thread.yield()
      assertEquals(Thread.State.BLOCKED, invalidationThread.state)
    } finally {
      release.countDown()
      setupThread.join(5000)
      invalidationThread.join(5000)
    }
    assertFalse(setupThread.isAlive)
    assertFalse(invalidationThread.isAlive)
    assertNull(failure.get())
    verify(recorder.get()).shutdown()
    val promise = mock(Promise::class.java)
    module.isRecording(promise)
    verify(promise).resolve(false)
  }
}
