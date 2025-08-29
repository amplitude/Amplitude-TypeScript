import { isNonSensitiveElement } from './helpers';
import { DATA_AMP_MASK_ATTRIBUTES, MASKED_TEXT_VALUE, TEXT_MASK_ATTRIBUTE } from './constants';
import type { HierarchyNode } from './typings/autocapture';

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
const MAX_ATTRIBUTE_LENGTH = 128;
export const MAX_HIERARCHY_LENGTH = 1024;

export function getElementProperties(
  element: Element | null,
  userMaskedAttributeNames: Set<string>,
): HierarchyNode | null {
  if (element === null) {
    return null;
  }

  const tagName = String(element.tagName).toLowerCase();
  const properties: HierarchyNode = {
    tag: tagName,
  };

  const siblings = Array.from(element.parentElement?.children ?? []);
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
      attributes[attr.name] = String(attr.value).substring(0, MAX_ATTRIBUTE_LENGTH);
    }
  }

  if (Object.keys(attributes).length) {
    properties.attrs = attributes;
  }

  return properties;
}

export function getAncestors(targetEl: Element | null): Element[] {
  const ancestors: Element[] = [];

  if (!targetEl) {
    return ancestors;
  }

  // Add self to the list of ancestors
  ancestors.push(targetEl);
  let current = targetEl.parentElement;
  while (current && current.tagName !== 'HTML') {
    ancestors.push(current);
    current = current.parentElement;
  }
  return ancestors;
}
