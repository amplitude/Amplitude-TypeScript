// nosemgrep: insecure-document-method -- test-only DOM fixture with static strings; no user input, not production code
/**
 * Vendored copy of the legacy autocapture cssPath algorithm.
 *
 * Source:  packages/plugin-autocapture-browser/src/libs/element-path.ts
 * (which itself is adapted from Chromium DevTools)
 *
 * Why a copy?
 *   The testbed needs to demonstrate the v1 kill-switch — when remote config
 *   sets `enabled: false`, autocapture stays on this legacy algorithm rather
 *   than calling the v1 engine. To reflect that accurately the page has to
 *   actually run the same code path the SDK falls back to.
 *
 *   The testbed is plain ES modules (no bundling for the package source).
 *   Pulling the algorithm from the autocapture package's TypeScript source
 *   would mean bundling that whole package too, which is overkill. A
 *   ~140-line vendored copy is the lower-friction option.
 *
 * IMPORTANT — keep in sync with the canonical TypeScript implementation if
 * the algorithm ever changes there. The two will diverge if nobody copies
 * forward; the only mitigation we have is comment-shaming the next person to
 * touch it.
 *
 * License: BSD-style, see the source file for the full Chromium notice.
 */

class Step {
  constructor(value, optimized) {
    this.value = value;
    this.optimized = optimized;
  }
  toString() {
    return this.value;
  }
}

export function legacyCssPath(node, optimized) {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const steps = [];
  let contextNode = node;

  while (contextNode) {
    const step = cssPathStep(contextNode, Boolean(optimized), contextNode === node);
    if (!step) {
      break;
    }
    steps.push(step);
    if (step.optimized) {
      break;
    }
    contextNode = contextNode.parentElement;
  }

  steps.reverse();
  return steps.join(' > ');
}

function cssPathStep(node, optimized, isTargetNode) {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const id = node.getAttribute('id');
  if (optimized) {
    if (id) {
      return new Step(idSelector(id), true);
    }

    const nodeNameLower = node.tagName.toLowerCase();
    if (nodeNameLower === 'body' || nodeNameLower === 'head' || nodeNameLower === 'html') {
      return new Step(nodeNameLower, true);
    }
  }

  const nodeName = node.tagName.toLowerCase();

  if (id) {
    return new Step(nodeName + idSelector(id), true);
  }

  const parent = node.parentNode;
  if (!parent || parent.nodeType === Node.DOCUMENT_NODE) {
    return new Step(nodeName, true);
  }

  const prefixedOwnClassNamesArray = prefixedElementClassNames(node);
  let needsClassNames = false;
  let needsNthChild = false;
  let ownIndex = -1;
  let elementIndex = -1;

  const siblings = parent.children;

  for (let i = 0; siblings && (ownIndex === -1 || !needsNthChild) && i < siblings.length; ++i) {
    const sibling = siblings[i];
    if (sibling.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    elementIndex += 1;
    if (sibling === node) {
      ownIndex = elementIndex;
      continue;
    }
    if (needsNthChild) {
      continue;
    }

    if (sibling.tagName.toLowerCase() !== nodeName) {
      continue;
    }

    needsClassNames = true;
    const ownClassNames = new Set(prefixedOwnClassNamesArray);
    if (!ownClassNames.size) {
      needsNthChild = true;
      continue;
    }

    const siblingClassNamesArray = prefixedElementClassNames(sibling);
    for (let j = 0; j < siblingClassNamesArray.length; ++j) {
      const siblingClass = siblingClassNamesArray[j];
      if (!ownClassNames.has(siblingClass)) {
        continue;
      }
      ownClassNames.delete(siblingClass);
      if (!ownClassNames.size) {
        needsNthChild = true;
        break;
      }
    }
  }

  let result = nodeName;
  if (
    isTargetNode &&
    nodeName.toLowerCase() === 'input' &&
    node.getAttribute('type') &&
    !node.getAttribute('id') &&
    !node.getAttribute('class')
  ) {
    result += '[type=' + escapeCss(node.getAttribute('type') || '') + ']';
  }
  if (needsNthChild) {
    result += ':nth-child(' + String(ownIndex + 1) + ')';
  } else if (needsClassNames) {
    for (const prefixedName of prefixedOwnClassNamesArray) {
      result += '.' + escapeCss(prefixedName.slice(1));
    }
  }

  return new Step(result, false);
}

function prefixedElementClassNames(el) {
  const classAttribute = el.getAttribute('class');
  if (!classAttribute) {
    return [];
  }
  return classAttribute
    .split(/\s+/g)
    .filter(Boolean)
    .map((name) => '$' + name);
}

function idSelector(id) {
  return '#' + escapeCss(id);
}

// CSS.escape isn't defined in every environment (e.g. older jsdom). Fall back
// to a conservative manual escape — same approach as the v1 engine's
// helpers/escape-id.ts.
function escapeCss(s) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(s);
  }
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/[A-Za-z0-9_-]/.test(ch)) {
      out += ch;
      continue;
    }
    const code = s.charCodeAt(i).toString(16);
    out += '\\' + code + ' ';
  }
  return out.endsWith(' ') ? out.slice(0, -1) : out;
}
