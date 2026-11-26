/**
 * Publish dialog "locked rows" (handoff 05-ROUTES, verified rule). Publishing saves the board and swaps its image
 * server-side (menu_swap_media), so a TV updates by itself when
 *   1. its playlist is the board's own playlist (display.playlist.id === board.playlistId), or
 *   2. the board image is assigned to it directly (display.media.id === board.mediaId).
 * Those rows show checked + disabled and are never sent as new assignments.
 *
 * Edge case (documented, not handled): a TV playing a DIFFERENT playlist that contains this board's image may also
 * update, because the swap replaces that image in every playlist. /api/displays does not expose playlist contents,
 * so that TV can't be identified in advance; it stays a normal, unlocked row and the UI promises nothing about it.
 *
 * A board that was never published has no playlistId or mediaId, so nothing is locked.
 */
export type PublishBoardRef = { playlistId: string | null; mediaId: string | null } | null | undefined;
type DisplayRef = { id: string; online: boolean; connected?: boolean; playlist?: { id: string } | null; media?: { id: string } | null };

export type LockedRow = { id: string; asleep: boolean };

export function lockedPublishRows(board: PublishBoardRef, displays: DisplayRef[] | null | undefined): Map<string, LockedRow> {
  const out = new Map<string, LockedRow>();
  if (!board || (!board.playlistId && !board.mediaId)) return out;
  for (const d of displays ?? []) {
    const own = Boolean(board.playlistId) && d.playlist?.id === board.playlistId;
    const direct = Boolean(board.mediaId) && d.media?.id === board.mediaId;
    if (own || direct) out.set(d.id, { id: d.id, asleep: !d.online });
  }
  return out;
}

/** The ids the dialog sends: ticked rows minus locked rows (locked rows update on their own). */
export function publishTargets(picked: Record<string, boolean>, locked: Map<string, LockedRow>): string[] {
  return Object.keys(picked).filter((id) => picked[id] && !locked.has(id));
}

/** "Live · N TVs" on a board card: connected displays whose playlist is the board's playlist (same rule as afterClassicSave). */
export function boardTvCount(board: { playlistId: string | null }, displays: { connected: boolean; playlist?: { id: string } | null }[] | null | undefined): number {
  if (!board.playlistId) return 0;
  return (displays ?? []).filter((d) => d.connected && d.playlist?.id === board.playlistId).length;
}
