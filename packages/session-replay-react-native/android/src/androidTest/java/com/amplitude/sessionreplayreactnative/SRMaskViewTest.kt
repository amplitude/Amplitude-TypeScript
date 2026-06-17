package com.amplitude.sessionreplayreactnative

import android.view.View
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.amplitude.sessionreplayreactnative.fabric.SRMaskView
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SRMaskViewTest {
  private class RecordingPrimitive : SRMaskingPrimitive {
    val masked = mutableListOf<View>()

    override fun mask(view: View, level: String) {
      masked.add(view)
    }

    override fun unmask(view: View) {
      masked.remove(view)
    }

    override fun clearForView(view: View) {
      masked.remove(view)
    }
  }

  @Before
  fun setUp() {
    SRMaskingRegistry.setPrimitive(null)
  }

  @Test
  fun maskChildFiresForEveryDirectChild() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val recordingPrimitive = RecordingPrimitive()
    SRMaskingRegistry.setPrimitive(recordingPrimitive)

    val view = SRMaskView(context)
    val childA = View(context)
    val childB = View(context)

    view.addView(childA)
    view.addView(childB)

    assertEquals(listOf(childA, childB), recordingPrimitive.masked)
  }
}
