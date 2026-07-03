import { types as t, type NodePath, type PluginObj, type PluginPass } from '@babel/core';
import type { AutocaptureTransformerOptions } from './types';

export const PACKAGE_NAME = '@amplitude/babel-plugin-autocapture-transformer';
export const PLUGIN_NAME = PACKAGE_NAME;

export type { AutocaptureTransformerOptions };

const AMPLITUDE_PACKAGE = '@amplitude/analytics-react-native';
const TRACK_IMPORT_NAME = 'track';
const BUTTON_PRESS_EVENT = '[Amplitude] Element Clicked';
const ACCESSIBILITY_LABEL_PROPERTY = 'accessibilityLabel';

function isButtonElement(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): boolean {
  return t.isJSXIdentifier(name) && name.name === 'Button';
}

function getJsxAttributeName(attr: t.JSXAttribute): string | null {
  if (t.isJSXIdentifier(attr.name)) {
    return attr.name.name;
  }
  if (t.isJSXNamespacedName(attr.name)) {
    return `${attr.name.namespace.name}:${attr.name.name.name}`;
  }
  return null;
}

function getImportedName(specifier: t.ImportSpecifier): string {
  if (t.isIdentifier(specifier.imported)) {
    return specifier.imported.name;
  }
  return specifier.imported.value;
}

function ensureTrackImport(programPath: NodePath<t.Program>): string {
  const body = programPath.get('body');

  for (const stmt of body) {
    if (!stmt.isImportDeclaration()) {
      continue;
    }
    if (stmt.node.source.value !== AMPLITUDE_PACKAGE) {
      continue;
    }

    for (const specifier of stmt.node.specifiers) {
      if (t.isImportSpecifier(specifier) && getImportedName(specifier) === TRACK_IMPORT_NAME) {
        return specifier.local.name;
      }
    }

    stmt.pushContainer(
      'specifiers',
      t.importSpecifier(t.identifier(TRACK_IMPORT_NAME), t.identifier(TRACK_IMPORT_NAME)),
    );
    return TRACK_IMPORT_NAME;
  }

  const importDeclaration = t.importDeclaration(
    [t.importSpecifier(t.identifier(TRACK_IMPORT_NAME), t.identifier(TRACK_IMPORT_NAME))],
    t.stringLiteral(AMPLITUDE_PACKAGE),
  );

  let lastImportIndex = -1;
  body.forEach((stmt, index) => {
    if (stmt.isImportDeclaration()) {
      lastImportIndex = index;
    }
  });

  if (lastImportIndex >= 0) {
    body[lastImportIndex].insertAfter(importDeclaration);
  } else {
    programPath.unshiftContainer('body', importDeclaration);
  }

  return TRACK_IMPORT_NAME;
}

function getAccessibilityLabelValue(attr: t.JSXAttribute): t.Expression | null {
  if (!attr.value) {
    return null;
  }

  if (t.isStringLiteral(attr.value)) {
    return attr.value;
  }

  if (t.isJSXExpressionContainer(attr.value)) {
    const { expression } = attr.value;
    if (t.isJSXEmptyExpression(expression)) {
      return null;
    }
    return expression;
  }

  return null;
}

function getAccessibilityLabelFromElement(node: t.JSXOpeningElement): t.Expression | null {
  for (const attr of node.attributes) {
    if (!t.isJSXAttribute(attr)) {
      continue;
    }

    if (getJsxAttributeName(attr) !== 'accessibilityLabel') {
      continue;
    }

    return getAccessibilityLabelValue(attr);
  }

  return null;
}

function buildTrackCall(trackIdentifier: string, accessibilityLabel: t.Expression | null): t.CallExpression {
  const args: t.Expression[] = [t.stringLiteral(BUTTON_PRESS_EVENT)];

  if (accessibilityLabel) {
    args.push(
      t.objectExpression([t.objectProperty(t.stringLiteral(ACCESSIBILITY_LABEL_PROPERTY), accessibilityLabel)]),
    );
  }

  return t.callExpression(t.identifier(trackIdentifier), args);
}

function wrapOnPressHandler(
  handler: t.Expression,
  trackIdentifier: string,
  accessibilityLabel: t.Expression | null,
): t.ArrowFunctionExpression {
  return t.arrowFunctionExpression(
    [t.restElement(t.identifier('args'))],
    t.blockStatement([
      t.expressionStatement(buildTrackCall(trackIdentifier, accessibilityLabel)),
      t.expressionStatement(t.callExpression(handler, [t.spreadElement(t.identifier('args'))])),
    ]),
  );
}

export default function autocaptureTransformer(_options: AutocaptureTransformerOptions = {}): PluginObj<PluginPass> {
  return {
    name: PLUGIN_NAME,
    visitor: {
      JSXOpeningElement(path) {
        const { node } = path;
        if (!isButtonElement(node.name)) {
          return;
        }

        let transformed = false;

        for (const attr of node.attributes) {
          if (!t.isJSXAttribute(attr)) {
            continue;
          }

          if (getJsxAttributeName(attr) !== 'onPress') {
            continue;
          }

          if (!attr.value || !t.isJSXExpressionContainer(attr.value)) {
            continue;
          }

          const { expression } = attr.value;
          if (t.isJSXEmptyExpression(expression)) {
            continue;
          }

          transformed = true;
        }

        if (!transformed) {
          return;
        }

        const programPath = path.findParent((parent) => parent.isProgram());
        if (!programPath?.isProgram()) {
          return;
        }

        let trackIdentifier = programPath.getData('autocaptureTrackIdentifier') as string | undefined;
        if (!trackIdentifier) {
          trackIdentifier = ensureTrackImport(programPath);
          programPath.setData('autocaptureTrackIdentifier', trackIdentifier);
        }

        const accessibilityLabel = getAccessibilityLabelFromElement(node);

        for (const attr of node.attributes) {
          if (!t.isJSXAttribute(attr)) {
            continue;
          }

          if (getJsxAttributeName(attr) !== 'onPress') {
            continue;
          }

          if (!attr.value || !t.isJSXExpressionContainer(attr.value)) {
            continue;
          }

          const { expression } = attr.value;
          if (t.isJSXEmptyExpression(expression)) {
            continue;
          }

          attr.value.expression = wrapOnPressHandler(expression, trackIdentifier, accessibilityLabel);
        }
      },
    },
  };
}
