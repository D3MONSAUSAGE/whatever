/** Time-zone choices with the common US zones first (QA U1-08). */
export const COMMON_ZONES: { id: string; label: string }[] = [
  { id: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { id: "America/Denver", label: "Mountain (Denver)" },
  { id: "America/Phoenix", label: "Arizona (Phoenix)" },
  { id: "America/Chicago", label: "Central (Chicago)" },
  { id: "America/New_York", label: "Eastern (New York)" },
  { id: "America/Anchorage", label: "Alaska (Anchorage)" },
  { id: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { id: "America/Puerto_Rico", label: "Atlantic (Puerto Rico)" },
  { id: "UTC", label: "UTC" },
];

const COMMON_IDS = new Set(COMMON_ZONES.map((zone) => zone.id));

/** The rest of the list, sorted A–Z by name, without the common zones. */
export function otherZones(all: string[]): string[] {
  return [...new Set(all)].filter((zone) => !COMMON_IDS.has(zone)).sort((a, b) => a.localeCompare(b));
}

/** Flat order for short lists (datalists): common US zones first, then the rest A–Z. */
export function orderedZones(all: string[]): string[] {
  return [...COMMON_ZONES.map((zone) => zone.id), ...otherZones(all)];
}

export function zoneLabel(zone: string): string {
  return COMMON_ZONES.find((item) => item.id === zone)?.label ?? zone.replace(/_/g, " ");
}
