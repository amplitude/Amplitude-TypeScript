import { isShadowRoot, walkComposedAncestors } from '@amplitude/element-selector';
import { isNonSensitiveElement } from './helpers';
import { SHADOW_OFF, type ShadowMode } from './shadow-mode';
import { DATA_AMP_MASK_ATTRIBUTES } from './constants';
import type { HierarchyNode } from './typings/autocapture';
import * as constants from './constants';
import { MASKED_TEXT_VALUE, TEXT_MASK_ATTRIBUTE } from '@amplitude/analytics-core';

const BLOCKED_ATTRIBUTES = new Set([
  // Already captured elsewhere in the hierarchy object
  'id',
  'class',

  // non-useful and potentially large attribute
  'style',

  // sensitive as prefilled form data may populate this attribute
  'value',

  // DOM events
  'onclick',
  'onchange',
  'oninput',
  'onblur',
  'onsubmit',
  'onfocus',
  'onkeydown',
  'onkeyup',
  'onkeypress',

  // React specific
  'data-reactid',
  'data-react-checksum',
  'data-reactroot',

  // Amplitude specific - used for redaction but should not be included in getElementProperties
  DATA_AMP_MASK_ATTRIBUTES,
  TEXT_MASK_ATTRIBUTE,
]);
const SENSITIVE_ELEMENT_ATTRIBUTE_ALLOWLIST = ['type'];

const SVG_TAGS = ['svg', 'path', 'g'];
const HIGHLY_SENSITIVE_INPUT_TYPES = ['password', 'hidden'];
export const MAX_HIERARCHY_LENGTH = 1024;

/** Siblings for positional indexing — includes shadow-root children at the tree top. */
function siblingCollection(element: Element, shadowAware: boolean): HTMLCollection | [] {
  if (element.parentElement) {
    return element.parentElement.children;
  }
  const root = element.getRootNode();
  if (shadowAware && isShadowRoot(root)) {
    return root.children;
  }
  return [];
}

export function getElementProperties(
  element: Element | null,
  userMaskedAttributeNames: Set<string>,
  shadow: ShadowMode = SHADOW_OFF,
): HierarchyNode | null {
  if (element === null) {
    return null;
  }

  const tagName = String(element.tagName).toLowerCase();
  const properties: HierarchyNode = {
    tag: tagName,
  };

  const siblings = Array.from(siblingCollection(element, shadow.enabled));
  if (siblings.length) {
    properties.index = siblings.indexOf(element);
    properties.indexOfType = siblings.filter((el) => el.tagName === element.tagName).indexOf(element);
  }

  const prevSiblingTag = element.previousElementSibling?.tagName?.toLowerCase();
  if (prevSiblingTag) {
    properties.prevSib = String(prevSiblingTag);
  }

  const id = element.getAttribute('id');
  if (id) {
    properties.id = String(id);
  }

  const classes = Array.from(element.classList);
  if (classes.length) {
    properties.classes = classes;
  }

  const attributes: Record<string, string> = {};
  const attributesArray = Array.from(element.attributes);
  const filteredAttributes = attributesArray.filter((attr) => !BLOCKED_ATTRIBUTES.has(attr.name));
  const isSensitiveElement = !isNonSensitiveElement(element);

  // if input is hidden or password or for SVGs, skip attribute collection entirely
  if (!HIGHLY_SENSITIVE_INPUT_TYPES.includes(String(element.getAttribute('type'))) && !SVG_TAGS.includes(tagName)) {
    for (const attr of filteredAttributes) {
      // If sensitive element, only allow certain attributes
      if (isSensitiveElement && !SENSITIVE_ELEMENT_ATTRIBUTE_ALLOWLIST.includes(attr.name)) {
        continue;
      }

      if (userMaskedAttributeNames.has(attr.name)) {
        attributes[attr.name] = MASKED_TEXT_VALUE;
        continue;
      }

      // Finally cast attribute value to string and limit attribute value length
      attributes[attr.name] = String(attr.value).substring(0, constants.MAX_ATTRIBUTE_LENGTH);
    }
  }

  if (Object.keys(attributes).length) {
    properties.attrs = attributes;
  }

  if (element.shadowRoot) {
    properties.attrs = { ...(properties.attrs || {}), 'data-amp-internal-shadow': 'true' };
    properties.shadow = true;
  }

  return properties;
}

// Top-level dispatch: light-DOM walk is the pre-shadow implementation.
export function getAncestors(targetEl: Element | null, shadow: ShadowMode = SHADOW_OFF): Element[] {
  if (!targetEl) {
    return [];
  }
  return shadow.enabled ? getAncestorsInShadow(targetEl, shadow.maxDepth) : getAncestorsLight(targetEl);
}

/** Pre-shadow behavior: `parentElement` only, stops at the shadow-tree boundary. */
function getAncestorsLight(targetEl: Element): Element[] {
  const ancestors: Element[] = [];
  ancestors.push(targetEl);
  let current = targetEl.parentElement;
  while (current && current.tagName !== 'HTML') {
    ancestors.push(current);
    current = current.parentElement;
  }
  return ancestors;
}

/** Shadow path: composed walk, stopping before `<html>`. */
function getAncestorsInShadow(targetEl: Element, maxDepth: number): Element[] {
  const ancestors: Element[] = [];
  for (const el of walkComposedAncestors(targetEl, maxDepth)) {
    if (el.tagName === 'HTML') {
      break;
    }
    ancestors.push(el);
  }
  return ancestors;
}
