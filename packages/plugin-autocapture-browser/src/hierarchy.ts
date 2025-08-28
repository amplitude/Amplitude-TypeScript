import { isNonSensitiveElement, parseAttributesToRedact, type JSONValue } from './helpers';
import { DATA_AMP_MASK_ATTRIBUTES } from './constants';
import type { Hierarchy, HierarchyNode } from './typings/autocapture';
import * as constants from './constants';

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
]);
const SENSITIVE_ELEMENT_ATTRIBUTE_ALLOWLIST = ['type'];

const SVG_TAGS = ['svg', 'path', 'g'];
const HIGHLY_SENSITIVE_INPUT_TYPES = ['password', 'hidden'];
const MAX_ATTRIBUTE_LENGTH = 128;
const MAX_HIERARCHY_LENGTH = 1024;

export function getElementProperties(
  element: Element | null,
  userBlockedAttributeNames: Set<string>,
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
  const filteredAttributes = attributesArray.filter(
    (attr) => !BLOCKED_ATTRIBUTES.has(attr.name) && !userBlockedAttributeNames.has(attr.name),
  );
  const isSensitiveElement = !isNonSensitiveElement(element);

  // if input is hidden or password or for SVGs, skip attribute collection entirely
  if (!HIGHLY_SENSITIVE_INPUT_TYPES.includes(String(element.getAttribute('type'))) && !SVG_TAGS.includes(tagName)) {
    for (const attr of filteredAttributes) {
      // If sensitive element, only allow certain attributes
      if (isSensitiveElement && !SENSITIVE_ELEMENT_ATTRIBUTE_ALLOWLIST.includes(attr.name)) {
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

// Get the DOM hierarchy of the element, starting from the target element to the root element.
export const getHierarchy = (element: Element | null): Hierarchy => {
  let hierarchy: Hierarchy = [];
  if (!element) {
    return [];
  }

  // Get list of ancestors including itself and get properties at each level in the hierarchy
  const ancestors = getAncestors(element);

  const elementToRedactedAttributesMap = new Map<Element, Set<string>>();
  const reversedAncestors = [...ancestors].reverse(); // root to target order

  for (let i = 0; i < reversedAncestors.length; i++) {
    const node = reversedAncestors[i];
    if (node) {
      const redactedAttributes = parseAttributesToRedact(node.getAttribute(constants.DATA_AMP_MASK_ATTRIBUTES));
      const ancestorRedactedAttributes =
        i === 0
          ? new Set<string>()
          : parseAttributesToRedact(reversedAncestors[i - 1].getAttribute(constants.DATA_AMP_MASK_ATTRIBUTES));
      const allRedactedAttributes = new Set([...redactedAttributes, ...ancestorRedactedAttributes]);
      elementToRedactedAttributesMap.set(node, allRedactedAttributes);
    }
  }

  hierarchy = ensureListUnderLimit(
    ancestors.map((el) => getElementProperties(el, elementToRedactedAttributesMap.get(el) ?? new Set<string>())),
    MAX_HIERARCHY_LENGTH,
  ) as Hierarchy;

  // TODO: mask text in getElementProperties
  return hierarchy;
};

export function ensureListUnderLimit(list: Hierarchy | JSONValue[], bytesLimit: number): Hierarchy | JSONValue[] {
  let numChars = 0;
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (node === null) {
      // simulate 'None' in python
      numChars += 4;
    } else {
      const value = ensureUnicodePythonCompatible(node);
      // Using Array.from(string).length instead of string.length
      // to correctly count Unicode characters (including emojis)
      numChars += value ? Array.from(value).length : 4;
    }
    if (numChars > bytesLimit) {
      return list.slice(0, i);
    }
  }
  return list;
}

/**
 * Converts a JSON-compatible value to a Python-compatible string representation.
 * This function handles various data types and ensures proper escaping and formatting.
 *
 * @param value - The value to be converted (can be any JSON-compatible type)
 * @param nested - Indicates if the value is nested within another structure (default: false)
 * @returns A string representation of the value compatible with Python, or null if conversion fails
 */
export function ensureUnicodePythonCompatible(value: HierarchyNode | JSONValue | null, nested = false): string | null {
  try {
    if (value == null) {
      // Handle null values
      if (nested) {
        return 'None'; // Represent null as 'None' in Python when nested
      }
      return null; // Return null for top-level null values
    } else if (typeof value === 'string') {
      if (nested) {
        // Escape special characters in nested strings
        value = value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');

        // Handle quotes in the string
        if (value.includes('"')) {
          return `'${value}'`; // Wrap in single quotes if it contains double quotes
        }
        if (value.includes("'")) {
          return `"${value.replace(/'/g, "\\'")}"`; // Wrap in double quotes and escape single quotes
        }
        return `'${value}'`; // Default to wrapping in single quotes
      }
      return value; // Return non-nested strings as-is
    } else if (typeof value === 'boolean') {
      // Convert boolean to Python-style capitalized string
      return value ? 'True' : 'False';
    } else if (Array.isArray(value)) {
      // Handle arrays by recursively converting each element
      const elements = value.map((o) => ensureUnicodePythonCompatible(o, true));
      return `[${elements.join(', ')}]`;
    } else if (typeof value === 'object') {
      // Handle objects (dictionaries in Python)
      const entries = Object.entries(value)
        .filter(([key]) => key != null) // Filter out null keys
        .map(
          ([key, val]) =>
            `${String(ensureUnicodePythonCompatible(key, true))}: ${String(ensureUnicodePythonCompatible(val, true))}`,
        );
      let result = `{${entries.join(', ')}}`;

      // Handle single quotes in the resulting string
      if (result.includes("\\'")) {
        result = result.replace(/'/g, "'").replace(/'/g, "\\'");
      }
      return result;
    }
    // For any other types, return their string representation;
    return value.toString();
  } catch (e) {
    // Return null if any error occurs during the conversion
    return null;
  }
}
