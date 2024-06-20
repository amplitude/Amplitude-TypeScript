import { Hierarchy, HierarchyNode } from './typings/autocapture';

const SKIP_ATTRIBUTES = ['style', 'class', 'id'];

// TODO: make sure we filter null later
export function getElementProperties(element: Element | null): HierarchyNode | null {
  if (element === null) {
    return null;
  }

  const properties: HierarchyNode = {
    tag: element.tagName.toLowerCase(),
  };

  const siblings = Array.from(element.parentElement?.children ?? []);
  if (siblings.length) {
    properties.index = siblings.indexOf(element);
    properties.indexOfType = siblings.filter((el) => el.tagName === element.tagName).indexOf(element);
  }

  const id = element.id;
  if (id) {
    properties.id = id;
  }

  const classes = Array.from(element.classList);
  if (classes.length) {
    properties.class = classes;
  }

  const attributesArray = Array.from(element.attributes);
  const attributes: Record<string, string> = {};
  for (const attr of attributesArray) {
    if (SKIP_ATTRIBUTES.includes(attr.name)) {
      continue;
    }
    // TODO: do more filtering on the attributes for sensitive data
    attributes[attr.name] = String(attr.value);
  }
  if (Object.keys(attributes).length) {
    properties.attributes = attributes;
  }

  const prevSiblingTag = element.previousElementSibling?.tagName?.toLowerCase();
  if (prevSiblingTag) {
    properties.previousSiblingTag = prevSiblingTag;
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
  const hierarchy: Hierarchy = [];
  if (!element) {
    return hierarchy;
  }

  // Get list of ancestors including itself
  const ancestors = getAncestors(element);
  ancestors.forEach((ancestor) => {
    hierarchy.unshift(getElementProperties(ancestor));
  });
  return hierarchy;
};
