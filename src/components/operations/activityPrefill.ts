import type { ActivityRepeater } from "./ActivityRepeaterField";

/**
 * Values to fill the create-activity form with, e.g. from a net listing
 * (NETL-030). Nothing is created until the operator chooses Create.
 */
export interface ActivityPrefill {
  title: string;
  activityType: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM", or "". */
  time: string;
  frequency: string;
  repeater: ActivityRepeater | null;
}
