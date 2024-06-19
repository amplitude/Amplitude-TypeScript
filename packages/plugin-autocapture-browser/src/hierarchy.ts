type HierarchyNode = {
  tag: string;
  id?: string;
  class?: string[];
  attributes?: { [key: string]: string };
  index: number;
  indexOfType: number;
  previousSiblingTag?: string;
};
type Hierarchy = HierarchyNode[];

const SKIP_ATTRIBUTES = ['style', 'class', 'id'];

function getElementProperties(element: Element): HierarchyNode {
  const siblings = Array.from(element.parentElement?.children ?? []);
  const properties: HierarchyNode = {
    tag: element?.tagName?.toLowerCase(),
    index: siblings.indexOf(element),
    indexOfType: siblings.filter((el) => el.tagName === element.tagName).indexOf(element),
  };

  const id = element.id;
  if (id) {
    properties.id = id;
  }

  const classes = Array.from(element.classList);
  if (classes.length) {
    properties.class = classes;
  }

  const attributesArray = Array.from(element.attributes); // Convert to array
  const attributes: Record<string, string> = {};
  for (const attr of attributesArray) {
    if (SKIP_ATTRIBUTES.includes(attr.name)) {
      continue;
    }
    // TODO: do more filtering on the attributes for sesitive data
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

function getAncestors(targetEl: Element, addSelf: boolean): Element[] {
  const ancestors = [];
  // Add self to the list of ancestors
  if (addSelf) {
    ancestors.push(targetEl);
  }
  let current = targetEl.parentElement;
  while (current && current.tagName !== 'HTML') {
    ancestors.push(current);
    current = current.parentElement;
  }
  return ancestors;
}

// Get the DOM hierarchy of the element, starting from the target element to the root element.
export const getHierarchy = (element: Element): Hierarchy => {
  const hierarchy: Hierarchy = [];
  // Get list of ancestors including itself
  const ancestors = getAncestors(element, true);
  ancestors.forEach((ancestor) => {
    hierarchy.unshift(getElementProperties(ancestor));
  });
  return hierarchy;
};
