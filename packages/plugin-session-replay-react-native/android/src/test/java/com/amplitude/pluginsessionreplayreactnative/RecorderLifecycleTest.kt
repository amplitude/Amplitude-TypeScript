package com.amplitude.pluginsessionreplayreactnative

import android.content.Context
import com.amplitude.android.sessionreplay.SessionReplay
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test
import org.mockito.Mockito.*

class RecorderLifecycleTest {
  private fun module(): PluginSessionReplayReactNativeModule {
    val context = mock(ReactApplicationContext::class.java)
    `when`(context.applicationContext).thenReturn(mock(Context::class.java))
    return PluginSessionReplayReactNativeModule(context)
  }

  private fun setup(module: PluginSessionReplayReactNativeModule) {
    module.setup("api-key", "device", 1.0, "US", 1.0, false, 0, true, "medium")
  }

  @Test
  fun failedReplacementKeepsTheWorkingRecorder() {
    val module = module()
    mockConstruction(SessionReplay::class.java) { recorder, construction ->
      if (construction.count == 2) throw IllegalStateException("construction failed")
      `when`(recorder.shouldRecord()).thenReturn(true)
    }.use { construction ->
      setup(module)
      val original = construction.constructed().single()
      assertThrows(RuntimeException::class.java) { setup(module) }
      verify(original, never()).shutdown()
      val promise = mock(Promise::class.java)
      module.isRecording(promise)
      verify(promise).resolve(true)
      module.stop()
      module.start()
      verify(original, times(2)).start()
    }
  }

  @Test
  fun successfulReplacementIsConstructedBeforeRetiringTheOldRecorder() {
    val module = module()
    val original = AtomicReference<SessionReplay>()
    mockConstruction(SessionReplay::class.java) { _, construction ->
      if (construction.count == 2) verify(original.get(), never()).shutdown()
    }.use { construction ->
      setup(module)
      original.set(construction.constructed().single())
      setup(module)
      val next = construction.constructed()[1]
      val order = inOrder(original.get(), next)
      order.verify(original.get()).shutdown()
      order.verify(next).start()
    }
  }

  @Test
  fun invalidatedModuleCannotConstructOrStartARecorder() {
    val module = module()
    module.invalidate()
    mockConstruction(SessionReplay::class.java).use { construction ->
      setup(module)
      module.start()
      assertTrue(construction.constructed().isEmpty())
      val promise = mock(Promise::class.java)
      module.isRecording(promise)
      verify(promise).resolve(false)
    }
  }

  @Test
  fun invalidationWaitsForConstructionThenShutsDownTheReplacement() {
    val module = module()
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
        }.use { setup(module) }
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
