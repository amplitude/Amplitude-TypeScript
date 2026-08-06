export type HierarchyNode = {
  tag: string;
  id?: string;
  classes?: string[];
  attrs?: { [key: string]: string };
  index?: number;
  indexOfType?: number;
  prevSib?: string;
  /**
   * Present (true) when this element is a top-level child of an open shadow
   * root — i.e. the next entry up in the hierarchy is the shadow HOST, and a
   * consumer re-resolving the path must descend through `host.shadowRoot`
   * rather than `host.children` at this boundary. Absent for light-DOM nodes,
   * so existing hierarchies are byte-identical.
   */
  shadow?: boolean;
};

export type Hierarchy = (HierarchyNode | null)[];
