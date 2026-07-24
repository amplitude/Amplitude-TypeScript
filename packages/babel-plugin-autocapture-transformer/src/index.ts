import { types as t, type NodePath, type PluginObj, type PluginPass } from '@babel/core';
import type { TransformerOptions } from './types';

export const PACKAGE_NAME = '@amplitude/babel-plugin-autocapture-transformer';
export const PLUGIN_NAME = PACKAGE_NAME;

export type { TransformerOptions as AutocaptureTransformerOptions };

const AMPLITUDE_PACKAGE = '@amplitude/analytics-react-native';
const AMP_CAPTURE_IMPORT_NAME = 'ampCapture';
const ACCESSIBILITY_LABEL_PROPERTY = 'accessibilityLabel';
const TEST_ID_PROPERTY = 'testID';
const ELEMENT_PROPERTY = 'element';
const COMPONENT_PROPERTY = 'component';
const CAPTURE_ATTRIBUTE_NAMES = [ACCESSIBILITY_LABEL_PROPERTY, TEST_ID_PROPERTY] as const;

export const DEFAULT_PRESSABLE_ELEMENTS = [
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
] as const;

export const DEFAULT_VALUE_CHANGE_ELEMENTS = ['Switch', 'Slider', 'Picker'] as const;

export const DEFAULT_TEXT_CHANGE_ELEMENTS = ['TextInput'] as const;

type CapturableElementCategory = {
  elements: readonly string[];
  eventForAttribute: Record<string, string>;
};

function mergeElementNames(defaults: readonly string[], extras?: string[]): string[] {
  if (!extras?.length) {
    return [...defaults];
  }

  return [...new Set([...defaults, ...extras])];
}

function buildCapturableElementCategories(options: TransformerOptions): CapturableElementCategory[] {
  return [
    {
      elements: mergeElementNames(DEFAULT_PRESSABLE_ELEMENTS, options.pressableElements),
      eventForAttribute: {
        onPress: 'Press',
        onLongPress: 'LongPress',
      },
    },
    {
      elements: mergeElementNames(DEFAULT_VALUE_CHANGE_ELEMENTS, options.valueChangeElements),
      eventForAttribute: {
        onValueChange: 'ValueChange',
      },
    },
    {
      elements: mergeElementNames(DEFAULT_TEXT_CHANGE_ELEMENTS, options.textChangeElements),
      eventForAttribute: {
        onChangeText: 'ChangeText',
        onSubmitEditing: 'SubmitEditing',
      },
    },
  ];
}

function getCapturableElementCategory(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
  categories: CapturableElementCategory[],
): CapturableElementCategory | null {
  if (!t.isJSXIdentifier(name)) {
    return null;
  }

  return categories.find((category) => category.elements.includes(name.name)) ?? null;
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

type CaptureProperties = Partial<Record<(typeof CAPTURE_ATTRIBUTE_NAMES)[number], t.Expression>> & {
  [ELEMENT_PROPERTY]?: t.Expression;
  [COMPONENT_PROPERTY]?: t.Expression;
};

function getEnclosingComponentName(path: NodePath): string | null {
  let current: NodePath | null = path.parentPath;

  while (current) {
    if (current.isFunctionDeclaration() && current.node.id) {
      return current.node.id.name;
    }

    if (current.isObjectMethod() && t.isIdentifier(current.node.key) && !current.node.computed) {
      return current.node.key.name;
    }

    if (current.isFunctionExpression() || current.isArrowFunctionExpression()) {
      if (current.isFunctionExpression() && current.node.id) {
        return current.node.id.name;
      }

      const parent = current.parentPath;
      if (parent.isVariableDeclarator() && t.isIdentifier(parent.node.id)) {
        return parent.node.id.name;
      }

      if (parent.isObjectProperty()) {
        const { key } = parent.node;
        if (t.isIdentifier(key) && !parent.node.computed) {
          return key.name;
        }
        if (t.isStringLiteral(key)) {
          return key.value;
        }
      }
    }

    if (current.isClassMethod() || current.isClassProperty()) {
      const classPath = current.findParent((parent) => parent.isClassDeclaration() || parent.isClassExpression());
      if (classPath) {
        if (classPath.isClassDeclaration() && classPath.node.id) {
          return classPath.node.id.name;
        }
        if (classPath.isClassExpression() && classPath.node.id) {
          return classPath.node.id.name;
        }
        const classParent = classPath.parentPath!;
        if (classParent.isVariableDeclarator() && t.isIdentifier(classParent.node.id)) {
          return classParent.node.id.name;
        }
      }
    }

    current = current.parentPath;
  }

  return null;
}

function getCapturePropertiesFromElement(path: NodePath<t.JSXOpeningElement>): CaptureProperties {
  const { node } = path;
  const properties: CaptureProperties = {};

  for (const attributeName of CAPTURE_ATTRIBUTE_NAMES) {
    const value = getJsxAttributeValueFromElement(node, attributeName);
    if (value) {
      properties[attributeName] = value;
    }
  }

  if (t.isJSXIdentifier(node.name)) {
    properties[ELEMENT_PROPERTY] = t.stringLiteral(node.name.name);
  }

  const componentName = getEnclosingComponentName(path);
  if (componentName) {
    properties[COMPONENT_PROPERTY] = t.stringLiteral(componentName);
  }

  return properties;
}

function buildAmpCaptureCall(
  captureIdentifier: string,
  handler: t.Expression,
  eventType: string,
  captureProperties: CaptureProperties,
): t.CallExpression {
  const properties: t.ObjectProperty[] = [t.objectProperty(t.identifier('event'), t.stringLiteral(eventType))];

  for (const attributeName of CAPTURE_ATTRIBUTE_NAMES) {
    const value = captureProperties[attributeName];
    if (value) {
      properties.push(t.objectProperty(t.identifier(attributeName), value));
    }
  }

  if (captureProperties[ELEMENT_PROPERTY]) {
    properties.push(t.objectProperty(t.identifier(ELEMENT_PROPERTY), captureProperties[ELEMENT_PROPERTY]));
  }

  if (captureProperties[COMPONENT_PROPERTY]) {
    properties.push(t.objectProperty(t.identifier(COMPONENT_PROPERTY), captureProperties[COMPONENT_PROPERTY]));
  }

  return t.callExpression(t.identifier(captureIdentifier), [handler, t.objectExpression(properties)]);
}

export default function autocaptureTransformer(
  _api?: unknown,
  options?: TransformerOptions | null,
): PluginObj<PluginPass> {
  const resolvedOptions = options ?? {};
  const capturableElementCategories = buildCapturableElementCategories(resolvedOptions);

  return {
    name: PLUGIN_NAME,
    visitor: {
      JSXOpeningElement(path) {
        const { node } = path;
        const category = getCapturableElementCategory(node.name, capturableElementCategories);
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

        const captureProperties = getCapturePropertiesFromElement(path);

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
