import { getGlobalScope } from '@amplitude/analytics-core';
import { isNonSensitiveElement, JSONValue } from './helpers';
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

  const tagName = String(element.tagName).toLowerCase();
  const properties: HierarchyNode = {
    tag: tagName,
  };

  // Get index of element in parent's children and index of type of element in parent's children
  let indexOfType = 0,
    indexOfElement = 0;
  const siblings = element.parentElement?.children ?? [];
  while (indexOfElement < siblings.length) {
    const el = siblings[indexOfElement];
    if (el === element) {
      properties.index = indexOfElement;
      properties.indexOfType = indexOfType;
      break;
    }
    indexOfElement++;
    if (el.tagName === element.tagName) {
      indexOfType++;
    }
  }

  const previousElement = element.previousElementSibling;
  if (previousElement) {
    properties.prevSib = String(previousElement.tagName).toLowerCase();
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
  const isSensitiveElement = !isNonSensitiveElement(element);

  // if input is hidden or password or for SVGs, skip attribute collection entirely
  let hasAttributes = false;
  if (!HIGHLY_SENSITIVE_INPUT_TYPES.includes(String(element.getAttribute('type'))) && !SVG_TAGS.includes(tagName)) {
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      if (BLOCKED_ATTRIBUTES.includes(attr.name)) {
        continue;
      }

      // If sensitive element, only allow certain attributes
      if (isSensitiveElement && !SENSITIVE_ELEMENT_ATTRIBUTE_ALLOWLIST.includes(attr.name)) {
        continue;
      }

      // Finally cast attribute value to string and limit attribute value length
      attributes[attr.name] = String(attr.value).substring(0, MAX_ATTRIBUTE_LENGTH);
      hasAttributes = true;
    }
  }

  if (hasAttributes) {
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

const globalScope = getGlobalScope();

// data structure that caches getHierarchy results so that results can be memoized
// if it's called on the same element and within the same event loop
const hierarchyCache = {
  cache: new Map<Element, Hierarchy>(),
  isScheduledToClear: false,
  has(element: Element) {
    return this.cache.has(element);
  },
  get(element: Element) {
    return this.cache.get(element);
  },
  set(element: Element, value: Hierarchy) {
    /* istanbul ignore next */
    if (!globalScope?.queueMicrotask) {
      return;
    }
    this.cache.set(element, value);

    // schedule the cache to be cleared right after the current event loop is empty
    if (!this.isScheduledToClear) {
      this.isScheduledToClear = true;
      globalScope.queueMicrotask(() => {
        this.cache.clear();
        this.isScheduledToClear = false;
      });
    }
  },
};

// Get the DOM hierarchy of the element, starting from the target element to the root element.
export const getHierarchy = (element: Element | null): Hierarchy => {
  let hierarchy: Hierarchy = [];
  if (!element) {
    return [];
  }

  if (hierarchyCache.has(element)) {
    return hierarchyCache.get(element) as Hierarchy;
  }

  // Get list of ancestors including itself and get properties at each level in the hierarchy
  const ancestors = getAncestors(element);
  hierarchy = ensureListUnderLimit(
    ancestors.map((el) => getElementProperties(el)),
    MAX_HIERARCHY_LENGTH,
  ) as Hierarchy;

  hierarchyCache.set(element, hierarchy);

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
