export type ActionType = 'click' | 'change';

export type HierarchyNode = {
  tag: string;
  id?: string;
  class?: string[];
  attributes?: { [key: string]: string };
  index?: number;
  indexOfType?: number;
  previousSiblingTag?: string;
};

export type Hierarchy = (HierarchyNode | null)[];
