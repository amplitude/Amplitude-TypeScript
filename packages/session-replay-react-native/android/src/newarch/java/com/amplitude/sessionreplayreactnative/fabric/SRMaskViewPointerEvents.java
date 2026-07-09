package com.amplitude.sessionreplayreactnative.fabric;

import com.facebook.react.uimanager.PointerEvents;
import com.facebook.react.views.view.ReactViewGroup;

/**
 * Java on purpose. {@code pointerEvents} has THREE incompatible source-level
 * shapes across React Native versions, so no single Kotlin syntax compiles
 * against all of them:
 *
 * <ul>
 *   <li>&le; ~0.77: Java interface + Java {@code ReactViewGroup} get/set pair
 *       (Kotlin property syntax OK, setter call OK)</li>
 *   <li>~0.78&ndash;0.80: Kotlin {@code ReactPointerEventsView} declares
 *       {@code val pointerEvents} while {@code ReactViewGroup} is still Java —
 *       Kotlin resolves assignment against the interface's {@code val} and
 *       rejects it ({@code 'val' cannot be reassigned}); only an explicit
 *       {@code setPointerEvents(...)} call compiles</li>
 *   <li>0.81+: {@code ReactViewGroup} is Kotlin with {@code var pointerEvents} —
 *       property syntax OK, but {@code setPointerEvents(...)} is an unresolved
 *       reference from Kotlin source</li>
 * </ul>
 *
 * The BYTECODE, however, has a {@code setPointerEvents(PointerEvents)} method
 * in every era (the Java method through 0.80; the Kotlin-var-generated setter
 * from 0.81, verified via javap of react-android AARs). Java source resolves
 * against bytecode, so this shim compiles and works on every supported RN
 * version.
 */
final class SRMaskViewPointerEvents {
  private SRMaskViewPointerEvents() {}

  static void forceBoxNone(ReactViewGroup view) {
    view.setPointerEvents(PointerEvents.BOX_NONE);
  }
}
