import type { SemanticDomChange, SemanticDomNode } from '../src/types';
import { recorderContext } from './page-feedback-helpers';

/** Explicit recorder input. Tests control delivery instead of creating a second DOM observer. */
export function replaySource(fixture: ReturnType<typeof recorderContext>) {
  const ids = new WeakMap<Node, number>();
  const mirror = new Map<number, Node>();
  let nextId = 1;
  const id = (node: Node) => {
    let value = ids.get(node);
    if (value === undefined) ids.set(node, (value = nextId++));
    mirror.set(value, node);
    return value;
  };
  const serialize = (node: Node): SemanticDomNode => ({
    id: id(node),
    type: node.nodeType === 1 ? 2 : node.nodeType === 9 ? 0 : 3,
    ...(node.nodeType === 1
      ? {
          tagName: (node as Element).tagName.toLowerCase(),
          attributes: Object.fromEntries(Array.from((node as Element).attributes, (attr) => [attr.name, attr.value])),
        }
      : {}),
    childNodes: Array.from(node.childNodes, serialize),
  });
  fixture.context.host.getNode = (key) => mirror.get(key) ?? null;
  fixture.context.host.getNodeId = id;
  fixture.context.helpers.id = id;
  const send = (change: SemanticDomChange) => fixture.signal('dom', change);
  const mutation = (part: Partial<Extract<SemanticDomChange, { type: 'mutation' }>>) =>
    send({ type: 'mutation', adds: [], removes: [], attributes: [], texts: [], ...part });
  return {
    id,
    serialize,
    send,
    mutation,
    snapshot: () => send({ type: 'snapshot', node: serialize(document.body) }),
    add: (node: Node) => mutation({ adds: [{ parentId: id(node.parentNode!), node: serialize(node) }] }),
    text: (node: Node) => mutation({ texts: [{ id: id(node) }] }),
    attrs: (element: Element, ...names: string[]) =>
      mutation({
        attributes: [
          { id: id(element), attributes: Object.fromEntries(names.map((name) => [name, element.getAttribute(name)])) },
        ],
      }),
    remove: (node: Node) => {
      const parentId = id(node.parentNode!);
      const removedId = id(node);
      node.parentNode!.removeChild(node);
      for (const [key, value] of mirror) if (node === value || node.contains(value)) mirror.delete(key);
      mutation({ removes: [{ parentId, id: removedId }] });
    },
  };
}
