import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { PLAYLIST_DEFAULT_DURATION_MS } from "@/lib/server/limits";
import { isMissingSchema, PLAYLISTS_UNAVAILABLE } from "@/lib/server/schema";
import { normalizePlaylistName } from "@/lib/server/validate";
import { fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const { data: lists, error } = await db()
    .from("playlists")
    .select("id, name, default_duration_ms, transition, published_at, updated_at, revision")
    .eq("account_id", admin.accountId)
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingSchema(error)) return fail(PLAYLISTS_UNAVAILABLE, 503);
    return fail("Couldn't load playlists.", 500);
  }

  const ids = (lists ?? []).map((list) => list.id);
  const slideCount = new Map<string, number>();
  const displayCount = new Map<string, number>();
  if (ids.length) {
    const { data: items, error: itemError } = await db()
      .from("playlist_items")
      .select("playlist_id")
      .eq("account_id", admin.accountId)
      .eq("kind", "draft")
      .in("playlist_id", ids);
    if (itemError) return fail("Couldn't load playlists.", 500);
    for (const item of items ?? []) {
      slideCount.set(item.playlist_id, (slideCount.get(item.playlist_id) ?? 0) + 1);
    }
    const { data: displays, error: displayError } = await db()
      .from("displays")
      .select("assigned_playlist_id")
      .eq("account_id", admin.accountId)
      .eq("status", "active")
      .in("assigned_playlist_id", ids);
    if (displayError && !isMissingSchema(displayError)) return fail("Couldn't load playlists.", 500);
    for (const display of displays ?? []) {
      const playlistId = display.assigned_playlist_id as string | null;
      if (!playlistId) continue;
      displayCount.set(playlistId, (displayCount.get(playlistId) ?? 0) + 1);
    }
  }

  return json(
    (lists ?? []).map((list) => ({
      id: list.id,
      name: list.name,
      defaultDurationMs: list.default_duration_ms,
      transition: list.transition,
      slideCount: slideCount.get(list.id) ?? 0,
      displayCount: displayCount.get(list.id) ?? 0,
      publishedAt: list.published_at,
      updatedAt: list.updated_at,
      revision: list.revision,
    })),
  );
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const name = normalizePlaylistName(body.name);
  if (!name) return fail("Give the playlist a name.", 400);

  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("playlists")
    .insert({
      account_id: admin.accountId,
      name,
      default_duration_ms: PLAYLIST_DEFAULT_DURATION_MS,
      transition: "none",
      revision: 0,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) {
    if (isMissingSchema(error)) return fail(PLAYLISTS_UNAVAILABLE, 503);
    return fail("Couldn't create the playlist.", 500);
  }
  return json({ id: data.id }, 201);
}
