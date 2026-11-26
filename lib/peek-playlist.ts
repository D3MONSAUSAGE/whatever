/**
 * Peek "Removal queued" (05-ROUTES /dashboard/playlists/[id]). publish_playlist assigns the playlist to ticked TVs and
 * unassigns it from every TV that had it but is unticked (unchanged). This only names those TVs before Publish.
 */
export function removalQueued<D extends { id: string; assigned: boolean }>(displays: D[], chosen: Record<string, boolean>): D[] {
  return displays.filter((display) => display.assigned && !chosen[display.id]);
}
