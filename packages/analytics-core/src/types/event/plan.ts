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
  /** The tracking plan version Id e.g. "9ec23ba0-275f-468f-80d1-66b88bff9529" */
  versionId?: string;
}
