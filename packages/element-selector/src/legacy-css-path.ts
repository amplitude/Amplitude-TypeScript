/**
 * Canonical legacy CSS-path walker.
 *
 * This is the Chromium-DevTools-derived `cssPath` algorithm that was the only
 * selector source autocapture used before the strategy engine existed. It still
 * matters in two situations:
 *
 *   1. The kill switch: when `ResolvedSelectorConfig.enabled === false`, the
 *      engine routes here so a customer who flips the engine off mid-session
 *      keeps emitting the same selectors their downstream zones and cohorts
 *      were built against.
 *   2. The safety net: when the strategy chain or its internal walker throws
 *      anything unexpected, the engine catches and falls back here. The
 *      autocapture click handler must always produce *some* selector — a
 *      runtime exception in selector generation is a worse outcome than a
 *      slightly less stable selector.
 *
 * Until this file existed, the algorithm was duplicated in two places kept
 * "in sync by comment":
 *
 *   - `packages/plugin-autocapture-browser/src/libs/element-path.ts`
 *   - `javascript/packages/session-replay-ui/src/utils/element-path.ts`
 *
 * Both will eventually re-export from here so divergence becomes impossible.
 *
 * Behavior is byte-identical to those two copies — selectors emitted by this
 * function for a given element MUST match what the SDK has been emitting in
 * production. Do not "fix" the selector format without an explicit version
 * bump and a coordinated dashboard rollout.
 *
 * **Why this lives in the package, not as an optional consumer concern:**
 *
 * Every consumer that uses `engine.generate(el)` benefits from the kill
 * switch and the safety net automatically. Without this, each new consumer
 * (Chrome extension visual tagger, future tagging surfaces) has to
 * reimplement the same router and the same legacy walker. We learned that
 * the hard way — by writing the same `if (config.enabled && engine) ...
 * else cssPath()` block in two repositories with two copies of cssPath.
 *
 * Code is adapted from The Chromium Authors.
 * Source: https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/panels/elements/DOMPath.ts#L14
 * License: BSD-style license
 *
 * Copyright 2014 The Chromium Authors
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *    * Redistributions of source code must retain the above copyright
 *      notice, this list of conditions and the following disclaimer.
 *    * Redistributions in binary form must reproduce the above
 *      copyright notice, this list of conditions and the following
 *      disclaimer in the documentation and/or other materials provided
 *      with the distribution.
 *    * Neither the name of Google Inc. nor the names of its
 *      contributors may be used to endorse or promote products derived
 *      from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/* istanbul ignore file -- the algorithm is locked-down behavior inherited from
   Chromium and validated by the SDK's own end-to-end suite. Re-running line
   coverage here only obscures the parts of the package that *do* have
   meaningful coverage. */

import { ElementSelectorLogger } from './types';
import { escapeCssIdentifier } from './helpers/escape-css-identifier';

class Step {
  constructor(public value: string, public optimized: boolean) {}
  toString(): string {
    return this.value;
  }
}

/**
 * Produce a CSS selector string for `node` using the legacy positional walker.
 *
 * Returns the empty string for non-element nodes — same shape every existing
 * caller depends on. Never throws for well-formed Element inputs.
 *
 * @param node      Element to identify.
 * @param optimized When `true`, short-circuits at the nearest unique-ish step
 *                  (id or `<body>` / `<head>` / `<html>`). Default `false`,
 *                  which matches what autocapture has always passed.
 */
export const legacyCssPath = (node: Element, optimized?: boolean): string => {
  // `node` is already an Element; this check is defensive.
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const steps: Step[] = [];
  let contextNode: Element | null = node;

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
};

const cssPathStep = (node: Element, optimized: boolean, isTargetNode: boolean): Step | null => {
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

  const siblings: HTMLCollectionOf<Element> = (parent as Element | Document).children;

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
    const ownClassNames = new Set<string>(prefixedOwnClassNamesArray);
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
    result += '[type=' + escapeCssIdentifier(node.getAttribute('type') || '') + ']';
  }
  if (needsNthChild) {
    result += ':nth-child(' + String(ownIndex + 1) + ')';
  } else if (needsClassNames) {
    for (const prefixedName of prefixedOwnClassNamesArray) {
      result += '.' + escapeCssIdentifier(prefixedName.slice(1));
    }
  }

  return new Step(result, false);
};

const prefixedElementClassNames = (el: Element): string[] => {
  const classAttribute = el.getAttribute('class');
  if (!classAttribute) {
    return [];
  }
  return classAttribute
    .split(/\s+/g)
    .filter(Boolean)
    .map((name) => {
      // The prefix is required to store "__proto__" in a object-based map.
      return '$' + name;
    });
};

const idSelector = (id: string): string => '#' + escapeCssIdentifier(id);

/**
 * Invoke `legacyCssPath` without letting a throw escape to the caller.
 *
 * Shared by `engine.generate` (kill switch + strategy-chain safety net) and
 * `generateSelector` (null-engine branch) so the swallow-warn-fallback
 * guarantee lives in one place.
 */
export function safeLegacyCssPath(el: Element, logger?: ElementSelectorLogger): string {
  try {
    return legacyCssPath(el);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger?.warn(`@amplitude/element-selector: legacyCssPath threw — emitting empty selector: ${message}`);
    return '';
  }
}
