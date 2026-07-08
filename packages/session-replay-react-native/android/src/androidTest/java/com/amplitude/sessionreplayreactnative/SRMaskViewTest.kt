package com.amplitude.sessionreplayreactnative

import android.content.Context
import android.view.View
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.amplitude.android.sessionreplay.SessionReplay
import com.amplitude.sessionreplayreactnative.fabric.SRMaskView
import com.amplitude.sessionreplayreactnative.fabric.SRMaskViewManager
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented canaries locking the masking model of the Fabric `SRMaskView`
 * host and the `SRMaskingRegistry` seam:
 *   - per-child mask intent on add (one [SRMaskingPrimitive.mask] per direct child)
 *   - reset on child removal and on host drop ([SRMaskViewManager.onDropViewInstance])
 *   - capture-bounds: a degenerate 0x0 host frame is widened to the union of
 *     its children so `shouldCapture()` (width>0 && height>0) would pass
 *   - masking intent recorded before a primitive registers is replayed once
 *     a primitive registers
 *
 * The registry is process-global state. [SRMaskingRegistry.setPrimitive] is
 * cleared (`null`) in [setUp]/[tearDown], but the registry intentionally retains
 * its weak-keyed `intents` map (for replay-on-register) and exposes no public
 * way to clear it. Because registering a primitive replays *every* still-live
 * recorded intent, tests register their primitive first and then clear the
 * recording before acting, so each assertion counts only its own calls (or
 * scopes assertions to the specific view under test).
 */
@RunWith(AndroidJUnit4::class)
class SRMaskViewTest {

  /** Records every call the Fabric host / registry routes through the seam. */
  private class RecordingPrimitive : SRMaskingPrimitive {
    sealed interface Call {
      val view: View

      data class Mask(override val view: View, val level: String) : Call
      data class Unmask(override val view: View) : Call
      data class Reset(override val view: View) : Call
    }

    val calls = mutableListOf<Call>()

    val maskCalls get() = calls.filterIsInstance<Call.Mask>()
    val resetCalls get() = calls.filterIsInstance<Call.Reset>()

    override fun mask(view: View, level: String) {
      calls.add(Call.Mask(view, level))
    }

    override fun unmask(view: View) {
      calls.add(Call.Unmask(view))
    }

    override fun reset(view: View) {
      calls.add(Call.Reset(view))
    }

    fun resetCountFor(view: View): Int = resetCalls.count { it.view === view }
  }

  private val context: Context
    get() = InstrumentationRegistry.getInstrumentation().targetContext

  /** Run on the main looper; view layout/listeners require the UI thread. */
  private fun onMain(block: () -> Unit) =
    InstrumentationRegistry.getInstrumentation().runOnMainSync(block)

  @Before
  fun setUp() {
    // Start each test from a clean, primitive-less registry.
    SRMaskingRegistry.setPrimitive(null)
  }

  @After
  fun tearDown() {
    SRMaskingRegistry.setPrimitive(null)
  }

  // 1. Per-child mask: each direct child added to the host produces exactly one
  //    mask call, in add order.
  @Test
  fun perChildMask_emitsOneMaskPerDirectChild_inOrder() {
    val recording = RecordingPrimitive()
    SRMaskingRegistry.setPrimitive(recording)
    // Drop any intents replayed from earlier tests; count only this test's adds.
    recording.calls.clear()

    val children = mutableListOf<View>()
    onMain {
      val host = SRMaskView(context)
      repeat(3) {
        val child = View(context)
        children.add(child)
        host.addView(child)
      }
    }

    assertEquals(
      "expected one mask call per direct child",
      3,
      recording.maskCalls.size,
    )
    // Same views, same order, default level "mask".
    recording.maskCalls.forEachIndexed { i, call ->
      assertSame("mask call $i targets the wrong view", children[i], call.view)
      assertEquals("default mask level should be \"mask\"", "mask", call.level)
    }
  }

  // 2. Reset on removeView: removing a child fires reset for exactly that child.
  @Test
  fun removeView_resetsRemovedChild() {
    val recording = RecordingPrimitive()
    SRMaskingRegistry.setPrimitive(recording)
    recording.calls.clear()

    lateinit var child: View
    onMain {
      val host = SRMaskView(context)
      child = View(context)
      host.addView(child)
      host.removeView(child)
    }

    assertEquals(
      "removeView should reset exactly the removed child once",
      1,
      recording.resetCountFor(child),
    )
  }

  // 3. Reset on onDropViewInstance: dropping the host resets every child.
  @Test
  fun onDropViewInstance_resetsAllChildren() {
    val recording = RecordingPrimitive()
    SRMaskingRegistry.setPrimitive(recording)
    recording.calls.clear()

    val manager = SRMaskViewManager()
    val children = mutableListOf<View>()
    onMain {
      val host = SRMaskView(context)
      repeat(3) {
        val child = View(context)
        children.add(child)
        host.addView(child)
      }
      manager.onDropViewInstance(host)
    }

    children.forEach { child ->
      assertTrue(
        "onDropViewInstance should reset child $child",
        recording.resetCountFor(child) >= 1,
      )
    }
  }

  // 4. Capture-bounds: a host given a degenerate 0x0 frame widens itself to
  //    the union of its laid-out children, so width>0 && height>0
  //    (shouldCapture() would pass).
  @Test
  fun degenerateHostFrame_widensToChildrenUnion() {
    lateinit var host: SRMaskView
    onMain {
      host = SRMaskView(context)
      val a = View(context)
      val b = View(context)
      host.addView(a)
      host.addView(b)
      // Give children non-zero, disjoint frames.
      a.layout(0, 0, 100, 50)
      b.layout(120, 60, 200, 140)
      // Simulate Fabric's display:contents 0x0 host frame. View.layout is final
      // and invokes the overridden onLayout -> expandBoundsToChildrenUnion.
      host.layout(0, 0, 0, 0)
    }

    assertTrue(
      "host width should be widened to the children union (got ${host.width})",
      host.width > 0,
    )
    assertTrue(
      "host height should be widened to the children union (got ${host.height})",
      host.height > 0,
    )
    // Union of (0,0,100,50) and (120,60,200,140) is (0,0,200,140).
    assertEquals("union width", 200, host.width)
    assertEquals("union height", 140, host.height)
  }

  // 4b. A childless host stays 0x0 after a degenerate layout — nothing to
  //     capture, nothing to widen.
  @Test
  fun degenerateHostFrame_withNoChildren_staysZero() {
    lateinit var host: SRMaskView
    onMain {
      host = SRMaskView(context)
      host.layout(0, 0, 0, 0)
    }

    assertEquals("childless host width should stay 0", 0, host.width)
    assertEquals("childless host height should stay 0", 0, host.height)
  }

  // 4c. Regression: Fabric lays the degenerate display:contents host out at a
  //     NON-ZERO parent offset. The host must widen to enclose its children
  //     WITHOUT moving: Fabric gives the children frames in the SAME coordinate
  //     space as the host's own frame (grandparent-relative — a display:contents
  //     node contributes no coordinate space of its own), so the widened extent
  //     is simply the children's max right/bottom, not host origin + extent.
  @Test
  fun degenerateHostFrame_atNonZeroOffset_widensWithoutMoving() {
    lateinit var host: SRMaskView
    onMain {
      host = SRMaskView(context)
      val a = View(context)
      val b = View(context)
      host.addView(a)
      host.addView(b)
      // Children laid out in the shared (grandparent-relative) coordinate
      // space, beyond the host's offset — as Fabric emits them.
      a.layout(300, 400, 400, 450)
      b.layout(420, 460, 500, 540)
      // Fabric places the 0x0 display:contents host at a non-zero parent offset.
      host.layout(300, 400, 300, 400)
    }

    // Extent == children union max right/bottom (500, 540) → size 200x140.
    assertEquals("union width at offset", 200, host.width)
    assertEquals("union height at offset", 140, host.height)
    // Position preserved — the host was NOT moved (else children shift absolutely).
    assertEquals("host left preserved", 300, host.left)
    assertEquals("host top preserved", 400, host.top)
  }

  // 5. Dropping the host detaches each child's layout listener, so a child that is
  //    recycled/reparented WITHOUT going through removeView no longer fires layout
  //    callbacks against (or leaks) the dropped host.
  @Test
  fun onHostDropped_detachesChildLayoutListeners() {
    lateinit var host: SRMaskView
    lateinit var child: View
    onMain {
      host = SRMaskView(context)
      child = View(context)
      host.addView(child)
      child.layout(0, 0, 100, 100)
      host.layout(0, 0, 0, 0) // onLayout widens the host to enclose the child
    }
    assertEquals("precondition: host widened to child", 100, host.width)

    onMain { host.onHostDropped() } // detaches the child's layout listener

    // Grow the child WITHOUT driving host.onLayout: only a still-attached listener
    // would re-widen the host. It must not, now that the listener is detached.
    onMain { child.layout(0, 0, 500, 500) }
    assertEquals("host must not re-widen after drop (listener detached)", 100, host.width)
  }

  // 6. The host must disable child clipping (iOS parity: SRMaskView.mm sets
  //    clipsToBounds=NO). Its Yoga node is display:contents, so the native host is
  //    0x0; with default clipChildren=true the masked subtree would paint
  //    invisibly on-screen even though its layout is correct.
  @Test
  fun srMaskViewDisablesChildClipping() {
    lateinit var host: SRMaskView
    onMain { host = SRMaskView(context) }
    assertTrue(
      "SRMaskView must not clip children (else masked content renders invisibly)",
      !host.clipChildren,
    )
  }

  // 5. Replay-on-register: masking intent recorded with no primitive is replayed when a
  //    primitive later registers.
  @Test
  fun maskIntentBeforeRegistration_isReplayedOnRegister() {
    lateinit var someView: View
    val recording = RecordingPrimitive()

    onMain {
      someView = View(context)
      // No primitive registered yet (setUp cleared it): intent is only recorded.
      SRMaskingRegistry.setPrimitive(null)
      SRMaskingRegistry.mask(someView, "custom")
      // Register the primitive AFTER the mask intent.
      SRMaskingRegistry.setPrimitive(recording)
    }

    // Scope to someView: setPrimitive replays *all* still-live intents (incl.
    // any leaked from earlier tests), so assert on this view specifically.
    val masksForSomeView = recording.maskCalls.filter { it.view === someView }
    assertEquals(
      "registering a primitive should replay exactly one mask intent for the view",
      1,
      masksForSomeView.size,
    )
    assertEquals(
      "replayed mask level should match the recorded intent",
      "custom",
      masksForSomeView.single().level,
    )
  }

  // 7. Default primitive mapping (Task 2.6): [SRDefaultMaskingPrimitive] bridges
  //    the seam to the Session Replay SDK's tag-based hooks. Each level is
  //    compared against a control view driven through the SDK static directly,
  //    so the tests don't depend on the SDK's internal tag constants.
  @Test
  fun defaultPrimitive_maskLevelMask_matchesSdkMask() {
    val primitive = SRDefaultMaskingPrimitive()
    lateinit var view: View
    lateinit var control: View
    onMain {
      view = View(context)
      control = View(context)
      primitive.mask(view, "mask")
      SessionReplay.mask(control)
    }

    assertNotNull("SDK mask should set a tag on the control view", control.tag)
    assertEquals("mask(\"mask\") must apply the SDK's mask tag", control.tag, view.tag)
  }

  @Test
  fun defaultPrimitive_maskLevelBlock_matchesSdkBlock() {
    val primitive = SRDefaultMaskingPrimitive()
    lateinit var view: View
    lateinit var control: View
    onMain {
      view = View(context)
      control = View(context)
      primitive.mask(view, "block")
      SessionReplay.block(control)
    }

    assertNotNull("SDK block should set a tag on the control view", control.tag)
    assertEquals("mask(\"block\") must apply the SDK's block tag", control.tag, view.tag)
  }

  @Test
  fun defaultPrimitive_unmask_matchesSdkUnmask() {
    val primitive = SRDefaultMaskingPrimitive()
    lateinit var view: View
    lateinit var control: View
    onMain {
      view = View(context)
      control = View(context)
      primitive.unmask(view)
      SessionReplay.unmask(control)
    }

    assertNotNull("SDK unmask should set a tag on the control view", control.tag)
    assertEquals("unmask must apply the SDK's unmask tag", control.tag, view.tag)
  }

  @Test
  fun defaultPrimitive_reset_clearsTag() {
    val primitive = SRDefaultMaskingPrimitive()
    lateinit var view: View
    onMain {
      view = View(context)
      primitive.mask(view, "mask")
    }
    assertNotNull("precondition: mask should set a tag", view.tag)

    onMain { primitive.reset(view) }
    assertNull("reset must clear the SDK tag (return to inherit)", view.tag)
  }
}
