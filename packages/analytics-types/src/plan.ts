/**
 * Tracking plan
 */
export interface Plan {
  /** The tracking plan branch name e.g. "main" */
  branch?: string;
  /** The tracking plan source e.g. "web" */
  source?: string;
  /** The tracking plan version e.g. "1", "15" */
  version?: string;
}
