import { types as t, type NodePath, type PluginObj, type PluginPass } from '@babel/core';
import type { AutocaptureTransformerOptions } from './types';

export const PACKAGE_NAME = '@amplitude/babel-plugin-autocapture-transformer';
export const PLUGIN_NAME = PACKAGE_NAME;

export type { AutocaptureTransformerOptions };

const AMPLITUDE_PACKAGE = '@amplitude/analytics-react-native';
const AMP_CAPTURE_IMPORT_NAME = 'ampCapture';
const ACCESSIBILITY_LABEL_PROPERTY = 'accessibilityLabel';
const TEST_ID_PROPERTY = 'testID';
const CAPTURE_ATTRIBUTE_NAMES = [ACCESSIBILITY_LABEL_PROPERTY, TEST_ID_PROPERTY] as const;

const PRESSABLE_ELEMENTS = [
  'Button',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'Pressable',
  'Touchable',
  'TouchableNativeFeedback',
  'TouchableWithoutFeedback',
  'TouchableHighlight',
  'Link',
];

const VALUE_CHANGE_ELEMENTS = ['Switch', 'Slider', 'Picker'];

const TEXT_CHANGE_ELEMENTS = ['TextInput'];

type CapturableElementCategory = {
  elements: readonly string[];
  eventForAttribute: Record<string, string>;
};

const CAPTURABLE_ELEMENT_CATEGORIES: CapturableElementCategory[] = [
  {
    elements: PRESSABLE_ELEMENTS,
    eventForAttribute: {
      onPress: 'Press',
      onLongPress: 'LongPress',
    },
  },
  {
    elements: VALUE_CHANGE_ELEMENTS,
    eventForAttribute: {
      onValueChange: 'ValueChange',
    },
  },
  {
    elements: TEXT_CHANGE_ELEMENTS,
    eventForAttribute: {
      onChangeText: 'ChangeText',
      onSubmitEditing: 'SubmitEditing',
    },
  },
];

function getCapturableElementCategory(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): CapturableElementCategory | null {
  if (!t.isJSXIdentifier(name)) {
    return null;
  }

  return CAPTURABLE_ELEMENT_CATEGORIES.find((category) => category.elements.includes(name.name)) ?? null;
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
      if (t.isImportSpecifier(specifier) && getImportedName(specifier) === AMP_CAPTURE_IMPORT_NAME) {
        return specifier.local.name;
      }
    }

    stmt.pushContainer(
      'specifiers',
      t.importSpecifier(t.identifier(AMP_CAPTURE_IMPORT_NAME), t.identifier(AMP_CAPTURE_IMPORT_NAME)),
    );
    return AMP_CAPTURE_IMPORT_NAME;
  }

  const importDeclaration = t.importDeclaration(
    [t.importSpecifier(t.identifier(AMP_CAPTURE_IMPORT_NAME), t.identifier(AMP_CAPTURE_IMPORT_NAME))],
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

  return AMP_CAPTURE_IMPORT_NAME;
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

function getJsxAttributeValueFromElement(node: t.JSXOpeningElement, attributeName: string): t.Expression | null {
  for (const attr of node.attributes) {
    if (!t.isJSXAttribute(attr)) {
      continue;
    }

    if (getJsxAttributeName(attr) !== attributeName) {
      continue;
    }

    return getAccessibilityLabelValue(attr);
  }

  return null;
}

function getCapturePropertiesFromElement(
  node: t.JSXOpeningElement,
): Partial<Record<(typeof CAPTURE_ATTRIBUTE_NAMES)[number], t.Expression>> {
  const properties: Partial<Record<(typeof CAPTURE_ATTRIBUTE_NAMES)[number], t.Expression>> = {};

  for (const attributeName of CAPTURE_ATTRIBUTE_NAMES) {
    const value = getJsxAttributeValueFromElement(node, attributeName);
    if (value) {
      properties[attributeName] = value;
    }
  }

  return properties;
}

function buildAmpCaptureCall(
  captureIdentifier: string,
  handler: t.Expression,
  eventType: string,
  captureProperties: Partial<Record<(typeof CAPTURE_ATTRIBUTE_NAMES)[number], t.Expression>>,
): t.CallExpression {
  const properties: t.ObjectProperty[] = [t.objectProperty(t.identifier('event'), t.stringLiteral(eventType))];

  for (const attributeName of CAPTURE_ATTRIBUTE_NAMES) {
    const value = captureProperties[attributeName];
    if (value) {
      properties.push(t.objectProperty(t.identifier(attributeName), value));
    }
  }

  return t.callExpression(t.identifier(captureIdentifier), [handler, t.objectExpression(properties)]);
}

export default function autocaptureTransformer(_options: AutocaptureTransformerOptions = {}): PluginObj<PluginPass> {
  return {
    name: PLUGIN_NAME,
    visitor: {
      JSXOpeningElement(path) {
        const { node } = path;
        const category = getCapturableElementCategory(node.name);
        if (!category) {
          return;
        }

        let transformed = false;

        for (const attr of node.attributes) {
          if (!t.isJSXAttribute(attr)) {
            continue;
          }

          const attrName = getJsxAttributeName(attr);
          if (!attrName || !category.eventForAttribute[attrName]) {
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

        let captureIdentifier = programPath.getData('autocaptureCaptureIdentifier') as string | undefined;
        if (!captureIdentifier) {
          captureIdentifier = ensureTrackImport(programPath);
          programPath.setData('autocaptureCaptureIdentifier', captureIdentifier);
        }

        const captureProperties = getCapturePropertiesFromElement(node);

        for (const attr of node.attributes) {
          if (!t.isJSXAttribute(attr)) {
            continue;
          }

          const attrName = getJsxAttributeName(attr);
          const eventType = attrName ? category.eventForAttribute[attrName] : undefined;
          if (!attrName || !eventType) {
            continue;
          }

          if (!attr.value || !t.isJSXExpressionContainer(attr.value)) {
            continue;
          }

          const { expression } = attr.value;
          if (t.isJSXEmptyExpression(expression)) {
            continue;
          }

          attr.value.expression = buildAmpCaptureCall(captureIdentifier, expression, eventType, captureProperties);
        }
      },
    },
  };
}
