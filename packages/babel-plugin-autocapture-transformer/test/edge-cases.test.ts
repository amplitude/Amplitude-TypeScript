import { parse } from '@babel/parser';
import { transformSync, types as t, type PluginPass } from '@babel/core';
import traverse, { type NodePath } from '@babel/traverse';
import type { JSXAttribute, JSXOpeningElement } from '@babel/types';
import autocaptureTransformer from '../src';

const mutateJsxAttributesPlugin = () => ({
  name: 'test-mutate-jsx-attributes',
  visitor: {
    JSXOpeningElement(path: NodePath<JSXOpeningElement>) {
      for (const attr of path.node.attributes) {
        if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) {
          continue;
        }

        if (attr.name.name === 'onPress') {
          attr.value = t.jsxExpressionContainer(t.jsxEmptyExpression());
        }

        if (attr.name.name === 'accessibilityLabel') {
          attr.value = t.jsxExpressionContainer(t.jsxEmptyExpression());
        }

        if (attr.name.name === 'testID') {
          attr.value = t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('span'), [], true), null, [], true);
        }
      }
    },
  },
});

const corruptTitleAttributeNamePlugin = () => ({
  name: 'test-corrupt-title-attribute-name',
  visitor: {
    JSXOpeningElement(path: NodePath<JSXOpeningElement>) {
      const titleAttribute = path.node.attributes.find(
        (attr): attr is JSXAttribute => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: 'title' }),
      );

      if (titleAttribute) {
        titleAttribute.name = { type: 'UnsupportedAttributeName' } as unknown as JSXAttribute['name'];
      }
    },
  },
});

describe('@amplitude/babel-plugin-autocapture-transformer edge cases', () => {
  let fileCounter = 0;

  const filename = () => `EdgeCase-${++fileCounter}.tsx`;

  const transformWithoutJsxPreset = (input: string) =>
    transformSync(input, {
      plugins: [mutateJsxAttributesPlugin, autocaptureTransformer, '@babel/plugin-syntax-jsx'],
      filename: filename(),
      configFile: false,
      babelrc: false,
    })?.code;

  it('skips empty press handlers while wrapping valid handlers on the same element', () => {
    const input = `function Home() {
  return <Button onPress={fn} onLongPress={fn2} accessibilityLabel={label} testID={id} title="Go" />;
}`;

    expect(transformWithoutJsxPreset(input)).toMatchSnapshot();
  });

  it('handles namespaced JSX attribute names', () => {
    const input = `function Home() {
  return <Button xml:lang="en" onPress={fn} title="Go" />;
}`;

    const result = transformSync(input, {
      plugins: [autocaptureTransformer, '@babel/plugin-syntax-jsx'],
      parserOpts: {
        plugins: ['jsx'],
      },
      filename: filename(),
      configFile: false,
      babelrc: false,
    })?.code;

    expect(result).toMatchSnapshot();
  });

  it('ignores attributes with unsupported name nodes', () => {
    const ast = parse('function Home() { return <Button onPress={fn} title="Go" />; }', {
      plugins: ['jsx'],
      sourceType: 'module',
    });

    traverse(ast, corruptTitleAttributeNamePlugin().visitor);

    let jsxPath: NodePath<JSXOpeningElement> | undefined;

    traverse(ast, {
      JSXOpeningElement(path) {
        jsxPath = path;
        path.stop();
      },
    });

    const plugin = autocaptureTransformer();
    const visitor = plugin.visitor.JSXOpeningElement;

    if (typeof visitor === 'function') {
      visitor.call({} as PluginPass, jsxPath as NodePath<JSXOpeningElement>, {} as PluginPass);
    }

    const onPressAttribute = (jsxPath as NodePath<JSXOpeningElement>).node.attributes.find(
      (attr): attr is JSXAttribute => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: 'onPress' }),
    );

    expect(onPressAttribute).toBeDefined();
    expect(onPressAttribute && t.isJSXExpressionContainer(onPressAttribute.value)).toBe(true);
    expect(
      onPressAttribute &&
        t.isJSXExpressionContainer(onPressAttribute.value) &&
        t.isCallExpression(onPressAttribute.value.expression),
    ).toBe(true);
  });

  it('skips non-expression press handlers during transformation', () => {
    const input = `function Home() {
  return <Button onPress={onPress} onLongPress="handler" title="Go" />;
}`;

    expect(
      transformSync(input, {
        plugins: [autocaptureTransformer, '@babel/plugin-syntax-jsx'],
        filename: filename(),
        configFile: false,
        babelrc: false,
      })?.code,
    ).toMatchSnapshot();
  });

  it('omits component when a class method has no enclosing class node', () => {
    const ast = parse('class HomeScreen { render() { return <Button onPress={fn} title="Go" />; } }', {
      plugins: ['jsx'],
      sourceType: 'module',
    });

    let jsxPath: NodePath<JSXOpeningElement> | undefined;

    traverse(ast, {
      JSXOpeningElement(path) {
        jsxPath = path;
        const classMethodPath = path.findParent((parent) => parent.isClassMethod());
        if (classMethodPath) {
          classMethodPath.findParent = (() => null) as typeof classMethodPath.findParent;
        }
        path.stop();
      },
    });

    expect(jsxPath).toBeDefined();

    const plugin = autocaptureTransformer();
    const visitor = plugin.visitor.JSXOpeningElement;
    if (typeof visitor === 'function') {
      visitor.call({} as PluginPass, jsxPath as NodePath<JSXOpeningElement>, {} as PluginPass);
    }

    const onPressAttribute = (jsxPath as NodePath<JSXOpeningElement>).node.attributes.find(
      (attr): attr is JSXAttribute => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: 'onPress' }),
    );

    expect(
      onPressAttribute &&
        t.isJSXExpressionContainer(onPressAttribute.value) &&
        t.isCallExpression(onPressAttribute.value.expression) &&
        t.isObjectExpression(onPressAttribute.value.expression.arguments[1]) &&
        onPressAttribute.value.expression.arguments[1].properties.every(
          (property) => !(t.isObjectProperty(property) && t.isIdentifier(property.key, { name: 'component' })),
        ),
    ).toBe(true);
  });

  it('returns early when JSX is not nested under a Program node', () => {
    const ast = parse('function Home() { return <Button onPress={fn} title="Go" />; }', {
      plugins: ['jsx'],
      sourceType: 'module',
    });

    let jsxPath: NodePath<JSXOpeningElement> | undefined;

    traverse(ast, {
      JSXOpeningElement(path) {
        jsxPath = path;
        path.stop();
      },
    });

    expect(jsxPath).toBeDefined();

    const openingElementPath = jsxPath as NodePath<JSXOpeningElement>;
    const plugin = autocaptureTransformer();
    const visitor = plugin.visitor.JSXOpeningElement;
    const originalFindParent = openingElementPath.findParent.bind(openingElementPath);
    openingElementPath.findParent = (() => null) as typeof openingElementPath.findParent;

    expect(() => {
      if (typeof visitor === 'function') {
        visitor.call({} as PluginPass, openingElementPath, {} as PluginPass);
      }
    }).not.toThrow();

    openingElementPath.findParent = originalFindParent;
  });
});
