import { isNonSensitiveElement } from './helpers';
import { Hierarchy, HierarchyNode } from './typings/autocapture';

const BLOCKED_ATTRIBUTES = [
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
];
const SENSITIVE_ELEMENT_ATTRIBUTE_ALLOWLIST = ['type'];

const SVG_TAGS = ['svg', 'path', 'g'];
const HIGHLY_SENSITIVE_INPUT_TYPES = ['password', 'hidden'];
const MAX_ATTRIBUTE_LENGTH = 128;
const MAX_HIERARCHY_LENGTH = 1024;

export function getElementProperties(element: Element | null): HierarchyNode | null {
  if (element === null) {
    return null;
  }

  const tagName = element.tagName.toLowerCase();
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
    properties.previousSiblingTag = prevSiblingTag;
  }

  const id = element.id;
  if (id) {
    properties.id = id;
  }

  const classes = Array.from(element.classList);
  if (classes.length) {
    properties.class = classes;
  }

  const attributes: Record<string, string> = {};
  const attributesArray = Array.from(element.attributes);
  const filteredAttributes = attributesArray.filter((attr) => !BLOCKED_ATTRIBUTES.includes(attr.name));
  const isSensitiveElement = !isNonSensitiveElement(element);

  // if input is hidden or password or for SVGs, skip attribute collection entirely
  if (!HIGHLY_SENSITIVE_INPUT_TYPES.includes((element as HTMLInputElement).type) && !SVG_TAGS.includes(tagName)) {
    for (const attr of filteredAttributes) {
      // If sensitive element, only allow certain attributes
      if (isSensitiveElement && !SENSITIVE_ELEMENT_ATTRIBUTE_ALLOWLIST.includes(attr.name)) {
        continue;
      }

      // Finally limit attribute value length and save it
      attributes[attr.name] = String(attr.value).substring(0, MAX_ATTRIBUTE_LENGTH);
    }
  }

  if (Object.keys(attributes).length) {
    properties.attributes = attributes;
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

// Get the DOM hierarchy of the element, starting from the target element to the root element.
export const getHierarchy = (element: Element | null): Hierarchy => {
  let outChars = 2;
  const hierarchy: Hierarchy = [];
  if (!element) {
    return hierarchy;
  }

  // Get list of ancestors including itself and get properties at each level in the hierarchy
  const ancestors = getAncestors(element);
  for (let i = 0; i < ancestors.length; i++) {
    const elProperties = getElementProperties(ancestors[i]);
    const elPropertiesLength = JSON.stringify(elProperties).length;

    // If adding the next ancestor would exceed the max hierarchy length, stop
    const commaLength = i > 0 ? 1 : 0;
    if (outChars + elPropertiesLength + commaLength > MAX_HIERARCHY_LENGTH) {
      break;
    }

    outChars += elPropertiesLength + commaLength;
    hierarchy.unshift(elProperties);
  }
  return hierarchy;
};
