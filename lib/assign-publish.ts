/** Busy flag for Assign playlist → Publish to selected screens. */

export type AssignPublishBusy = null | "checking" | "publishing";

/**
 * 'Checking…' only while the preview request is in flight.
 * Clear it before confirm.ask so the button does not stick on 'Checking…',
 * and set 'publishing' only after the confirm comes back ok.
 */
export function assignBusyFor(phase: "preview" | "confirm" | "commit" | "idle"): AssignPublishBusy {
  if (phase === "preview") return "checking";
  if (phase === "commit") return "publishing";
  return null;
}
