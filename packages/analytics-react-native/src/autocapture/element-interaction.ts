import type { AmpCaptureProperties } from '../amp-capture';
import {
  SCREEN_NAME,
  TARGET_ACCESSIBILITY_LABEL,
  TARGET_ACTION,
  TARGET_COMPONENT,
  TARGET_ELEMENT,
  TARGET_TEST_ID,
} from '../constants';

/**
 * Map the properties captured by `ampCapture` to the `[Amplitude] ...` element event properties
 * shared by `[Amplitude] Element Interacted` and the frustration events built on top of it.
 */
export function getElementInteractionEventProperties(
  properties: AmpCaptureProperties,
  screenName: string | undefined,
): Record<string, any> {
  return {
    [SCREEN_NAME]: screenName,
    [TARGET_ACCESSIBILITY_LABEL]: properties.accessibilityLabel,
    [TARGET_ACTION]: properties.action,
    [TARGET_COMPONENT]: properties.component,
    [TARGET_ELEMENT]: properties.element,
    [TARGET_TEST_ID]: properties.testID,
  };
}
