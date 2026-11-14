/** What the "Breakfast, lunch & dinner" wizard can show (QA B2-01, B2-05). */
export const DAY_PART_PRIORITY = 10;
export const PUBLISH_BOARD_FIRST = "Boards marked “publish this board first” have only been saved as drafts. Open the board and press Publish, then come back to schedule it.";

type MenuLite = { id: string; name: string; playlistId?: string | null };
type PlaylistLite = { id: string; name: string; publishedAt: string | null };

export function dayPartSources(menus: MenuLite[], playlists: PlaylistLite[]) {
  const boardPlaylists = new Set(menus.map((menu) => menu.playlistId).filter((id): id is string => Boolean(id)));
  const seen = new Set<string>();
  const boards = menus.filter((menu) => (seen.has(menu.id) ? false : (seen.add(menu.id), true)))
    .map((menu) => ({ id: menu.id, name: menu.name, ready: Boolean(menu.playlistId) }));
  return {
    boards,
    playlists: playlists.filter((playlist) => playlist.publishedAt && !boardPlaylists.has(playlist.id)),
  };
}
