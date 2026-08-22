export type HierarchyNode = {
  tag: string;
  id?: string;
  classes?: string[];
  attrs?: { [key: string]: string };
  index?: number;
  indexOfType?: number;
  prevSib?: string;
  shadow?: boolean;
};

export type Hierarchy = (HierarchyNode | null)[];
