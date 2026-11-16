export type ReportedState = "assigned" | "acknowledged" | "playing" | "pending" | "unknown";

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function iso(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

/**
 * Sync fields for the phone. They never replace connected or online.
 * connected === false (no TV has collected the token: never paired, or unpaired for reconnect) always
 * reports "pending" with no acknowledged/playing time. "pending" is a value every client already knows
 * (Android +14 reads it as "Waiting for TV"); a TV that was unpaired must not read as "playing".
 * Omitting connected keeps the older behaviour.
 */
export function playbackReport(row: {
  content_version?: unknown;
  confirmed_version?: unknown;
  confirmed_at?: unknown;
  acknowledged_version?: unknown;
  acknowledged_at?: unknown;
  hasAssignment: boolean;
  connected?: boolean;
}) {
  const contentVersion = num(row.content_version);
  const playingVersion = num(row.confirmed_version);
  const playingAt = iso(row.confirmed_at);
  const ackVersion = num(row.acknowledged_version);
  const ackAt = iso(row.acknowledged_at);
  const hasContent = row.hasAssignment || (contentVersion != null && contentVersion > 0);
  let reportedState: ReportedState = "unknown";
  if (hasContent) {
    if (contentVersion != null && playingVersion === contentVersion) reportedState = "playing";
    else if (contentVersion != null && ackVersion === contentVersion) reportedState = "acknowledged";
    else if (contentVersion != null && ((playingVersion != null && playingVersion < contentVersion) || (ackVersion != null && ackVersion < contentVersion))) reportedState = "pending";
    else reportedState = "assigned";
  }
  if (row.connected === false) reportedState = "pending";
  return {
    reportedState,
    contentVersion,
    acknowledgedAt: reportedState === "acknowledged" || reportedState === "playing" ? (ackAt || playingAt) : null,
    playingAt: reportedState === "playing" ? playingAt : null,
  };
}

/** While the TV has not caught up, or for two minutes after it does, poll every 2.5s. */
export function catchupPoll(contentVersion: number, confirmedVersion: unknown, confirmedAt: unknown) {
  const playing = num(confirmedVersion);
  const at = iso(confirmedAt);
  const recent = at != null && Date.now() - Date.parse(at) < 120_000;
  const behind = playing == null || playing !== contentVersion;
  if (!behind && !recent) return {};
  return { catchupMs: 2500, catchupForMs: 120_000 };
}
