import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Mode = "many" | "single" | "maybe";

export type Store = {
  accounts: Row[];
  locations: Row[];
  media: Row[];
  displays: Row[];
  playlists: Row[];
  playlist_items: Row[];
  pairing_sessions: Row[];
  rate_limits: Row[];
  screen_groups: Row[];
  screen_group_members: Row[];
  schedules: Row[];
  promos: Row[];
  display_playback: Row[];
  display_commands: Row[];
  menus: Row[];
  objects: Map<string, Uint8Array>;
  /** Missing key means "uploaded now". Null means the storage listing has no created_at. */
  objectTimes: Map<string, string | null>;
  users: Map<string, { id: string; email: string }>;
};

const TABLE_NAMES = [
  "accounts", "locations", "media", "displays", "playlists", "playlist_items",
  "pairing_sessions", "rate_limits", "screen_groups", "screen_group_members", "schedules", "promos",
  "display_playback", "display_commands", "menus",
] as const;
type TableName = (typeof TABLE_NAMES)[number];

function isTable(name: string): name is TableName {
  return (TABLE_NAMES as readonly string[]).includes(name);
}

function shape(rows: Row[], mode: Mode) {
  if (mode === "many") return { data: rows, error: null };
  if (rows.length === 1) return { data: rows[0], error: null };
  if (mode === "maybe" && rows.length === 0) return { data: null, error: null };
  return { data: null, error: { message: rows.length ? "multiple rows" : "no rows", code: "PGRST116" } };
}

function project(store: Store, row: Row, select?: string): Row {
  const copy = { ...row };
  if (select?.includes("assigned_media_id (")) {
    const media = store.media.find((m) => m.id === row.assigned_media_id);
    copy.media = media
      ? { id: media.id, file_name: media.file_name, storage_path: media.storage_path }
      : null;
  }
  return copy;
}

function insertRow(store: Store, table: TableName, row: Row) {
  if (table === "pairing_sessions" && (row.status ?? "pending") === "pending") {
    const dup = store.pairing_sessions.some((s) => s.status === "pending" && s.code_hash === row.code_hash);
    if (dup) return { error: { message: "duplicate key", code: "23505" } as { message: string; code: string } };
  }
  if (!row.id) row.id = crypto.randomUUID();
  // media.id is a primary key. A second insert has to fail the way Postgres does (23505)
  // so concurrent upload completes cannot both create a row.
  if (table === "media" && store.media.some((item) => item.id === row.id)) {
    return {
      error: {
        message: 'duplicate key value violates unique constraint "media_pkey"',
        code: "23505",
      } as { message: string; code: string },
    };
  }
  if (!row.created_at) row.created_at = new Date().toISOString();
  if (table === "pairing_sessions" && !row.status) row.status = "pending";
  if (table === "displays") {
    if (!row.status) row.status = "active";
    if (row.content_version == null) row.content_version = 0;
    if (row.assigned_playlist_id === undefined) row.assigned_playlist_id = null;
  }
  if (table === "playlists") {
    if (row.default_duration_ms == null) row.default_duration_ms = 10000;
    if (!row.transition) row.transition = "none";
    if (!row.playback_mode) row.playback_mode = "auto";
    if (row.revision == null) row.revision = 0;
    if (!row.updated_at) row.updated_at = row.created_at;
  }
  if (table === "locations" && row.timezone == null) row.timezone = "UTC";
  if (table === "screen_groups") {
    const name = String(row.name ?? "").toLowerCase();
    if (store.screen_groups.some((group) => group.account_id === row.account_id && String(group.name).toLowerCase() === name && group.id !== row.id)) {
      return { error: { message: "duplicate key", code: "23505" } as { message: string; code: string } };
    }
    if (!row.updated_at) row.updated_at = row.created_at;
  }
  if (table === "schedules") {
    if (row.enabled == null) row.enabled = true;
    if (row.priority == null) row.priority = 0;
    if (!row.updated_at) row.updated_at = row.created_at;
  }
  store[table].push(row);
  return { row, error: null as null };
}

class Query implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> {
  private op: {
    type: "select" | "insert" | "update" | "delete";
    select?: string;
    filters: [string, unknown][];
    inFilters: [string, unknown[]][];
    order?: { col: string; ascending: boolean };
    limit?: number;
    range?: { from: number; to: number };
    count?: "exact";
    head?: boolean;
    insert?: Row;
    update?: Row;
    mode: Mode;
  };
  private done: Promise<{ data: unknown; error: { message: string; code?: string } | null }> | null = null;

  constructor(private store: Store, private table: TableName) {
    this.op = { type: "select", filters: [], inFilters: [], mode: "many" };
  }

  select(cols = "*", opts?: { count?: "exact"; head?: boolean }) {
    this.op.select = String(cols);
    this.op.count = opts?.count;
    this.op.head = opts?.head === true;
    return this;
  }
  insert(row: Row) {
    this.op.type = "insert";
    this.op.insert = row;
    return this;
  }
  update(patch: Row) {
    this.op.type = "update";
    this.op.update = patch;
    return this;
  }
  delete() {
    this.op.type = "delete";
    return this;
  }
  eq(key: string, value: unknown) {
    this.op.filters.push([key, value]);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.op.inFilters.push([key, values]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.op.order = { col, ascending: opts?.ascending !== false };
    return this;
  }
  limit(count: number) {
    this.op.limit = count;
    return this;
  }
  range(from: number, to: number) {
    this.op.range = { from, to };
    return this;
  }
  single() {
    this.op.mode = "single";
    return this;
  }
  maybeSingle() {
    this.op.mode = "maybe";
    return this;
  }
  then<TResult1 = { data: unknown; error: { message: string; code?: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string; code?: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (!this.done) this.done = this.exec();
    return this.done.then(onfulfilled, onrejected);
  }

  private async exec() {
    const rows = this.store[this.table];
    const match = () => rows.filter((row) =>
      this.op.filters.every(([key, value]) => row[key] === value) &&
      this.op.inFilters.every(([key, values]) => values.includes(row[key])));

    if (this.op.type === "insert") {
      const result = insertRow(this.store, this.table, { ...(this.op.insert ?? {}) });
      if (result.error || !result.row) return { data: null, error: result.error };
      if (!this.op.select) return { data: null, error: null };
      return shape([project(this.store, result.row, this.op.select)], this.op.mode);
    }

    if (this.op.type === "update") {
      const found = match();
      for (const row of found) Object.assign(row, this.op.update);
      if (!this.op.select) return { data: null, error: null };
      return shape(found.map((row) => project(this.store, row, this.op.select)), this.op.mode);
    }

    if (this.op.type === "delete") {
      const found = match();
      const ids = new Set(found.map((row) => row.id));
      if (this.table === "screen_groups") {
        this.store.screen_group_members = this.store.screen_group_members.filter((row) => !ids.has(row.group_id));
        this.store.schedules = this.store.schedules.filter((row) => !ids.has(row.group_id));
      }
      if (this.table === "playlists") {
        this.store.schedules = this.store.schedules.filter((row) => !ids.has(row.playlist_id));
        this.store.playlist_items = this.store.playlist_items.filter((row) => !ids.has(row.playlist_id));
      }
      if (this.table === "displays") {
        this.store.screen_group_members = this.store.screen_group_members.filter((row) => !found.some((item) => item.id === row.display_id));
        this.store.schedules = this.store.schedules.filter((row) => !found.some((item) => item.id === row.display_id));
      }
      this.store[this.table] = rows.filter((row) => !found.includes(row));
      if (!this.op.select) return { data: null, error: null };
      return shape(found.map((row) => project(this.store, row, this.op.select)), this.op.mode);
    }

    let found = match().map((row) => project(this.store, row, this.op.select));
    if (this.op.order) {
      const { col, ascending } = this.op.order;
      found = found.sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * (ascending ? 1 : -1);
        return String(av ?? "").localeCompare(String(bv ?? "")) * (ascending ? 1 : -1);
      });
    }
    const total = found.length;
    if (this.op.range) found = found.slice(this.op.range.from, this.op.range.to + 1);
    else if (this.op.limit != null) found = found.slice(0, this.op.limit);
    if (this.op.count) return { data: this.op.head ? null : found, error: null, count: total };
    return shape(found, this.op.mode);
  }
}

function rateLimit(store: Store, key: string, windowSeconds: number, max: number) {
  const now = Date.now();
  let row = store.rate_limits.find((item) => item.key === key);
  if (!row) {
    row = { key, window_start: new Date(now).toISOString(), count: 1 };
    store.rate_limits.push(row);
  } else {
    const start = new Date(String(row.window_start)).getTime();
    if (start < now - windowSeconds * 1000) {
      row.count = 1;
      row.window_start = new Date(now).toISOString();
    } else {
      row.count = Number(row.count) + 1;
    }
  }
  return Number(row.count) <= max;
}

function rpc(store: Store, name: string, args: Record<string, unknown>) {
  if (name === "ensure_account") {
    const userId = String(args.p_user_id);
    const existing = store.accounts.find((account) => account.owner_user_id === userId);
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    store.accounts.push({ id, name: args.p_name, owner_user_id: userId, created_at: now });
    store.locations.push({ id: crypto.randomUUID(), account_id: id, name: "Main location", timezone: "UTC", created_at: now });
    return id;
  }
  if (name === "rate_limit_hit") {
    return rateLimit(store, String(args.p_key), Number(args.p_window_seconds), Number(args.p_max));
  }
  if (name === "cleanup_stale") {
    const now = Date.now();
    for (const session of store.pairing_sessions) {
      if (session.status === "pending" && new Date(String(session.expires_at)).getTime() < now) session.status = "expired";
    }
    const day = now - 86_400_000;
    store.pairing_sessions = store.pairing_sessions.filter((session) => new Date(String(session.created_at)).getTime() >= day);
    store.rate_limits = store.rate_limits.filter((item) => new Date(String(item.window_start)).getTime() >= day);
    return null;
  }
  if (name === "claim_pairing") {
    const now = Date.now();
    const session = store.pairing_sessions.find((item) =>
      item.code_hash === args.p_code_hash && item.status === "pending" && new Date(String(item.expires_at)).getTime() > now);
    if (!session) return null;
    const location = store.locations
      .filter((item) => item.account_id === args.p_account_id)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    const id = crypto.randomUUID();
    store.displays.push({
      id,
      account_id: args.p_account_id,
      location_id: location?.id ?? null,
      name: args.p_name,
      assigned_media_id: null,
      assigned_playlist_id: null,
      content_version: 0,
      token_hash: null,
      status: "active",
      last_seen_at: null,
      created_at: new Date(now).toISOString(),
    });
    session.status = "claimed";
    session.display_id = id;
    session.claimed_at = new Date(now).toISOString();
    return id;
  }
  if (name === "player_state") {
    const display = store.displays.find((item) => item.token_hash === args.p_token_hash && item.status === "active");
    if (!display) return [];
    const seen = display.last_seen_at ? new Date(String(display.last_seen_at)).getTime() : 0;
    if (!display.last_seen_at || seen < Date.now() - 30_000) display.last_seen_at = new Date().toISOString();
    const media = store.media.find((item) => item.id === display.assigned_media_id);
    return [{
      display_id: display.id,
      content_version: display.content_version,
      media_id: media?.id ?? null,
      storage_path: media?.storage_path ?? null,
    }];
  }
  if (name === "assign_media") {
    if (args.p_media_id != null) {
      const media = store.media.find((item) => item.id === args.p_media_id && item.account_id === args.p_account_id);
      if (!media || media.kind === "video") return false;
    }
    const display = store.displays.find((item) =>
      item.id === args.p_display_id && item.account_id === args.p_account_id && item.status === "active");
    if (!display) return false;
    display.assigned_media_id = args.p_media_id;
    display.assigned_playlist_id = null;
    display.content_version = Number(display.content_version) + 1;
    return true;
  }
  if (name === "menu_create_playlist") {
    const media = store.media.find((item) => item.id === args.p_media_id && item.account_id === args.p_account_id);
    if (!media) return null;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    store.playlists.push({
      id, account_id: args.p_account_id, name: String(args.p_name ?? "Menu").slice(0, 80),
      revision: 1, updated_at: now, default_duration_ms: 10000, transition: "none", playback_mode: "auto",
    });
    store.playlist_items.push({
      id: crypto.randomUUID(), playlist_id: id, account_id: args.p_account_id, media_id: media.id,
      kind: "published", position: 0, duration_ms: 10000, created_at: now,
    });
    return id;
  }
  if (name === "menu_swap_media") {
    const next = store.media.find((item) => item.id === args.p_new_media_id && item.account_id === args.p_account_id);
    if (!next) return false;
    const previous = args.p_old_media_id;
    if (previous == null) return true;
    const touched = new Set<string>();
    for (const item of store.playlist_items) {
      if (item.account_id === args.p_account_id && item.media_id === previous) {
        item.media_id = next.id;
        touched.add(String(item.playlist_id));
      }
    }
    for (const playlist of store.playlists) {
      if (playlist.account_id === args.p_account_id && touched.has(String(playlist.id))) {
        playlist.revision = Number(playlist.revision ?? 0) + 1;
        playlist.updated_at = new Date().toISOString();
      }
    }
    for (const display of store.displays) {
      if (display.account_id !== args.p_account_id) continue;
      if (touched.has(String(display.assigned_playlist_id))) display.content_version = Number(display.content_version) + 1;
      if (display.assigned_media_id === previous) {
        display.assigned_media_id = next.id;
        display.content_version = Number(display.content_version) + 1;
      }
    }
    return true;
  }
  if (name === "delete_media") {
    if (store.playlist_items.some((item) => item.media_id === args.p_media_id && item.account_id === args.p_account_id)) {
      throw new Error("media_in_playlist");
    }
    for (const display of store.displays) {
      if (display.assigned_media_id === args.p_media_id && display.account_id === args.p_account_id) {
        display.assigned_media_id = null;
        display.content_version = Number(display.content_version) + 1;
      }
    }
    const index = store.media.findIndex((item) => item.id === args.p_media_id && item.account_id === args.p_account_id);
    if (index < 0) return null;
    const path = store.media[index].storage_path;
    store.media.splice(index, 1);
    return path;
  }
  if (name === "save_playlist") return savePlaylist(store, args);
  if (name === "publish_playlist") return publishPlaylist(store, args);
  if (name === "delete_playlist") return deletePlaylist(store, args);
  if (name === "player_playlist") return playerPlaylist(store, args);
  if (name === "snapshot_playlist") return snapshotPlaylist(store, args);
  if (name === "report_player_error") {
    const display = store.displays.find((item) => item.token_hash === args.p_token_hash && item.status === "active");
    if (!display) return false;
    const message = String(args.p_error ?? "").trim();
    display.player_error = message ? message.slice(0, 180) : null;
    display.player_error_at = message ? new Date().toISOString() : null;
    return true;
  }

  if (name === "enqueue_display_command") {
    const display = store.displays.find((item) =>
      item.id === args.p_display_id && item.account_id === args.p_account_id && item.status === "active" && item.assigned_playlist_id);
    const account = store.accounts.find((item) => item.id === args.p_account_id && item.owner_user_id === args.p_user_id);
    if (!display || !account) return [];
    if (args.p_command !== "next" && args.p_command !== "prev") return [];
    let pb = store.display_playback.find((item) => item.display_id === display.id);
    if (!pb) {
      pb = {
        display_id: display.id,
        account_id: display.account_id,
        playlist_id: display.assigned_playlist_id,
        playback_mode: "auto",
        item_index: 0,
        item_count: 0,
        content_version: 0,
        last_applied_seq: 0,
        last_issued_seq: 0,
        updated_at: new Date().toISOString(),
      };
      store.display_playback.push(pb);
    }
    pb.last_issued_seq = Number(pb.last_issued_seq) + 1;
    pb.updated_at = new Date().toISOString();
    const id = crypto.randomUUID();
    store.display_commands.push({
      id,
      display_id: display.id,
      account_id: display.account_id,
      command: args.p_command,
      seq: pb.last_issued_seq,
      issued_by: args.p_user_id,
      created_at: new Date().toISOString(),
      applied_at: null,
    });
    return [{ command_id: id, seq: pb.last_issued_seq }];
  }
  if (name === "set_display_playlist_mode") {
    const display = store.displays.find((item) =>
      item.id === args.p_display_id && item.account_id === args.p_account_id && item.status === "active");
    const account = store.accounts.find((item) => item.id === args.p_account_id && item.owner_user_id === args.p_user_id);
    if (!display || !account || !display.assigned_playlist_id) return false;
    if (args.p_mode !== "auto" && args.p_mode !== "manual") return false;
    const playlist = store.playlists.find((item) => item.id === display.assigned_playlist_id && item.account_id === args.p_account_id && item.published_at);
    if (!playlist) return false;
    playlist.playback_mode = args.p_mode;
    playlist.published_playback_mode = args.p_mode;
    playlist.revision = Number(playlist.revision) + 1;
    playlist.updated_at = new Date().toISOString();
    for (const d of store.displays) {
      if (d.account_id === args.p_account_id && d.status === "active" && d.assigned_playlist_id === playlist.id) {
        d.content_version = Number(d.content_version) + 1;
      }
    }
    let pb = store.display_playback.find((item) => item.display_id === display.id);
    if (!pb) {
      pb = {
        display_id: display.id,
        account_id: display.account_id,
        playlist_id: playlist.id,
        playback_mode: args.p_mode,
        item_index: 0,
        item_count: 0,
        content_version: display.content_version,
        last_applied_seq: 0,
        last_issued_seq: 0,
        updated_at: new Date().toISOString(),
      };
      store.display_playback.push(pb);
    } else {
      pb.playlist_id = playlist.id;
      pb.playback_mode = args.p_mode;
      pb.updated_at = new Date().toISOString();
    }
    return true;
  }
  if (name === "player_pending_commands") {
    const display = store.displays.find((item) => item.token_hash === args.p_token_hash && item.status === "active");
    if (!display) return [];
    const pb = store.display_playback.find((item) => item.display_id === display.id);
    const after = pb ? Number(pb.last_applied_seq) : 0;
    return store.display_commands
      .filter((item) => item.display_id === display.id && item.applied_at == null && Number(item.seq) > after)
      .sort((a, b) => Number(a.seq) - Number(b.seq))
      .map((item) => ({ seq: Number(item.seq), command: item.command }));
  }
  if (name === "player_report_playback") {
    const display = store.displays.find((item) => item.token_hash === args.p_token_hash && item.status === "active");
    if (!display) return false;
    const mode = args.p_playback_mode === "manual" ? "manual" : "auto";
    let pb = store.display_playback.find((item) => item.display_id === display.id);
    if (!pb) {
      pb = {
        display_id: display.id,
        account_id: display.account_id,
        playlist_id: args.p_playlist_id,
        playback_mode: mode,
        item_index: Number(args.p_item_index) || 0,
        item_count: Number(args.p_item_count) || 0,
        content_version: Number(args.p_content_version) || 0,
        last_applied_seq: Number(args.p_last_applied_seq) || 0,
        last_issued_seq: 0,
        updated_at: new Date().toISOString(),
      };
      store.display_playback.push(pb);
    } else {
      pb.playlist_id = args.p_playlist_id;
      pb.playback_mode = mode;
      pb.item_index = Number(args.p_item_index) || 0;
      pb.item_count = Number(args.p_item_count) || 0;
      pb.content_version = Number(args.p_content_version) || 0;
      pb.last_applied_seq = Math.max(Number(pb.last_applied_seq) || 0, Number(args.p_last_applied_seq) || 0);
      pb.updated_at = new Date().toISOString();
    }
    const through = Number(args.p_last_applied_seq) || 0;
    if (through > 0) {
      for (const cmd of store.display_commands) {
        if (cmd.display_id === display.id && cmd.applied_at == null && Number(cmd.seq) <= through) {
          cmd.applied_at = new Date().toISOString();
        }
      }
    }
    display.last_seen_at = new Date().toISOString();
    return true;
  }

  if (name === "presentation_create_playlist") {
    const accountId = args.p_account_id;
    const sourceId = args.p_source_media_id;
    const mode = args.p_playback_mode === "auto" ? "auto" : "manual";
    const rawName = String(args.p_name ?? "").trim().slice(0, 80);
    if (!rawName) return null;
    const source = store.media.find((item) => item.id === sourceId && item.account_id === accountId && item.kind === "presentation");
    if (!source) return null;
    const revision = Number(source.group_revision ?? 0);
    const slides = store.media
      .filter((item) => item.account_id === accountId && item.source_media_id === sourceId && (item.kind == null || item.kind === "image"))
      .filter((item) => revision <= 0 ? item.slide_revision == null : Number(item.slide_revision) === revision)
      .sort((a, b) => Number(a.slide_index) - Number(b.slide_index));
    if (!slides.length || slides.length > 40) return null;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    store.playlists.push({
      id,
      account_id: accountId,
      name: rawName,
      default_duration_ms: 10000,
      transition: "none",
      playback_mode: mode,
      published_at: now,
      published_transition: "none",
      published_playback_mode: mode,
      revision: 1,
      created_at: now,
      updated_at: now,
    });
    for (const slide of slides) {
      for (const kind of ["draft", "published"] as const) {
        store.playlist_items.push({
          id: crypto.randomUUID(),
          playlist_id: id,
          account_id: accountId,
          media_id: slide.id,
          kind,
          position: Number(slide.slide_index),
          duration_ms: kind === "published" ? 10000 : null,
          created_at: now,
        });
      }
    }
    return id;
  }

  if (name === "presentation_claim_group") {
    const media = store.media.find((item) => item.id === args.p_media_id && item.account_id === args.p_account_id);
    if (!media || media.kind !== "presentation") return { outcome: "missing" };
    const expected = Number(args.p_expected_revision);
    const revision = Number(media.group_revision ?? 0);
    if (revision !== expected) return { outcome: "conflict", revision };
    const fresh = media.processing_status === "processing" && media.updated_at
      && Date.now() - Date.parse(String(media.updated_at)) < 2 * 60 * 1000;
    if (fresh) return { outcome: "busy", revision };
    const token = crypto.randomUUID();
    const childMax = store.media
      .filter((item) => item.source_media_id === media.id)
      .reduce((max, item) => Math.max(max, Number(item.slide_revision ?? 0)), 0);
    const generation = Math.max(Number(media.processing_generation ?? 0), revision, childMax) + 1;
    media.processing_status = "processing";
    media.processing_token = token;
    media.processing_generation = generation;
    media.processing_error = null;
    media.processing_done = 0;
    media.updated_at = new Date().toISOString();
    return { outcome: "claimed", token, revision, generation };
  }

  if (name === "presentation_claim_heartbeat") {
    const media = store.media.find((item) => item.id === args.p_media_id && item.account_id === args.p_account_id);
    if (!media || media.processing_token !== args.p_token || media.processing_status !== "processing") return false;
    media.updated_at = new Date().toISOString();
    return true;
  }

  if (name === "presentation_insert_slide") {
    const media = store.media.find((item) => item.id === args.p_source_id && item.account_id === args.p_account_id);
    if (!media || media.kind !== "presentation" || media.processing_status !== "processing") return null;
    if (media.processing_token !== args.p_token || Number(media.processing_generation) !== Number(args.p_generation)) return null;
    store.media.push({
      id: args.p_slide_id,
      account_id: args.p_account_id,
      file_name: args.p_file_name,
      storage_path: args.p_storage_path,
      mime_type: "image/png",
      size_bytes: args.p_size_bytes,
      kind: "image",
      width: args.p_width,
      height: args.p_height,
      source_media_id: args.p_source_id,
      slide_index: args.p_slide_index,
      slide_revision: args.p_generation,
      claim_token: args.p_token,
      created_at: new Date().toISOString(),
    });
    return args.p_slide_id;
  }

  if (name === "presentation_discard_staging") {
    const media = store.media.find((item) => item.id === args.p_media_id && item.account_id === args.p_account_id);
    if (!media) return [];
    const committed = Number(media.group_revision ?? 0);
    const drop = store.media.filter((item) => item.account_id === args.p_account_id && item.source_media_id === media.id && item.claim_token === args.p_token && Number(item.slide_revision) !== committed);
    const paths = drop.map((item) => String(item.storage_path)).filter(Boolean);
    const ids = new Set(drop.map((item) => item.id));
    store.media = store.media.filter((item) => !ids.has(item.id));
    return paths;
  }

  if (name === "presentation_group_snapshot") {
    const ids = new Set((args.p_media_ids as string[]) ?? []);
    const parents = store.media.filter((item) => item.account_id === args.p_account_id && ids.has(String(item.id)) && item.kind === "presentation");
    const rows: Record<string, unknown>[] = [];
    for (const parent of parents) {
      const slides = store.media.filter((item) => item.account_id === parent.account_id && item.source_media_id === parent.id);
      if (!slides.length) {
        rows.push({
          parent_id: parent.id,
          file_name: parent.file_name,
          group_revision: parent.group_revision ?? 0,
          group_duration_ms: parent.group_duration_ms ?? null,
          processing_status: parent.processing_status ?? null,
          account_id: parent.account_id,
          slide_id: null,
        });
        continue;
      }
      for (const slide of slides) {
        rows.push({
          parent_id: parent.id,
          file_name: parent.file_name,
          group_revision: parent.group_revision ?? 0,
          group_duration_ms: parent.group_duration_ms ?? null,
          processing_status: parent.processing_status ?? null,
          account_id: parent.account_id,
          slide_id: slide.id,
          storage_path: slide.storage_path,
          slide_index: slide.slide_index,
          slide_revision: slide.slide_revision ?? null,
          slide_duration_ms: slide.slide_duration_ms ?? null,
          width: slide.width ?? null,
          height: slide.height ?? null,
        });
      }
    }
    return rows;
  }

  if (name === "presentation_commit_group") {
    const media = store.media.find((item) => item.id === args.p_media_id && item.account_id === args.p_account_id);
    if (!media || media.kind !== "presentation") return null;
    if (args.p_token && media.processing_token !== args.p_token) return null;
    const expected = Number(args.p_expected_revision);
    if (Number(media.group_revision ?? 0) !== expected) return null;
    const generation = Number(args.p_generation);
    if (Number(media.processing_generation) !== generation || generation <= expected) return null;
    const slides = store.media.filter((item) => item.account_id === args.p_account_id && item.source_media_id === media.id && item.claim_token === args.p_token && Number(item.slide_revision) === generation);
    if (slides.length !== Number(args.p_slide_count)) return null;
    if (new Set(slides.map((item) => Number(item.slide_index))).size !== slides.length) return null;
    media.group_revision = generation;
    media.processing_status = "ready";
    media.processing_error = null;
    media.processing_done = Number(args.p_slide_count);
    media.slide_count = Number(args.p_slide_count);
    media.width = args.p_width;
    media.height = args.p_height;
    media.size_bytes = args.p_size_bytes;
    media.file_name = args.p_file_name;
    media.mime_type = args.p_mime_type;
    if (args.p_storage_path) media.storage_path = args.p_storage_path;
    if (media.group_duration_ms == null) media.group_duration_ms = 10000;
    media.processing_token = null;
    media.updated_at = new Date().toISOString();
    const playlistIds = new Set(
      store.playlist_items.filter((item) => item.media_id === media.id && item.kind === "published").map((item) => item.playlist_id),
    );
    for (const playlist of store.playlists) {
      if (playlistIds.has(playlist.id)) {
        playlist.revision = Number(playlist.revision ?? 0) + 1;
        playlist.updated_at = media.updated_at;
      }
    }
    for (const display of store.displays) {
      if (display.account_id === args.p_account_id && display.status === "active" && playlistIds.has(display.assigned_playlist_id)) {
        display.content_version = Number(display.content_version) + 1;
      }
    }
    return generation;
  }

  if (name === "delete_presentation_group") {
    const media = store.media.find((item) => item.id === args.p_media_id && item.account_id === args.p_account_id);
    if (!media || media.kind !== "presentation") return null;
    const drop = store.media.filter((item) => item.account_id === args.p_account_id && (item.id === media.id || item.source_media_id === media.id));
    const ids = new Set(drop.map((item) => item.id));
    const lists = [...new Set(store.playlist_items.filter((item) => ids.has(item.media_id)).map((item) => String(item.playlist_id)))];
    const published = [...new Set(store.playlist_items.filter((item) => ids.has(item.media_id) && item.kind === "published").map((item) => String(item.playlist_id)))];
    store.playlist_items = store.playlist_items.filter((item) => !ids.has(item.media_id));
    for (const playlistId of lists) {
      for (const kind of ["draft", "published"]) {
        const rows = store.playlist_items
          .filter((item) => item.playlist_id === playlistId && item.kind === kind)
          .sort((a, b) => Number(a.position) - Number(b.position));
        rows.forEach((item, index) => { item.position = index; });
      }
    }
    for (const playlist of store.playlists) {
      if (published.includes(String(playlist.id))) playlist.revision = Number(playlist.revision ?? 0) + 1;
    }
    for (const display of store.displays) {
      if (display.account_id !== args.p_account_id) continue;
      const showing = ids.has(display.assigned_media_id);
      const playing = display.status === "active" && published.includes(String(display.assigned_playlist_id));
      if (showing) display.assigned_media_id = null;
      if (showing || playing) display.content_version = Number(display.content_version) + 1;
    }
    const paths = drop.flatMap((item) => [item.storage_path, item.thumbnail_path].filter(Boolean).map(String));
    store.media = store.media.filter((item) => !ids.has(item.id));
    return paths;
  }

  throw new Error(`Unknown rpc ${name}`);
}

function savePlaylist(store: Store, args: Record<string, unknown>) {
  const playlist = store.playlists.find((item) => item.id === args.p_playlist_id && item.account_id === args.p_account_id);
  if (!playlist) return false;
  const name = String(args.p_name ?? "").trim();
  const duration = Number(args.p_default_duration_ms);
  const transition = String(args.p_transition ?? "");
  const items = Array.isArray(args.p_items) ? args.p_items as { mediaId?: string; durationMs?: number | null }[] : null;
  if (!name || name.length > 80 || !Number.isInteger(duration) || duration < 1000 || duration > 600000) return false;
  if (transition !== "none" && transition !== "fade") return false;
  if (!items || items.length > 40) return false;
  for (const item of items) {
    const media = store.media.find((row) => row.id === item.mediaId && row.account_id === args.p_account_id);
    if (!media) return false;
    if (item.durationMs != null) {
      const presentation = media.kind === "presentation";
      const min = presentation ? 3000 : 1000;
      const max = presentation ? 3600000 : 600000;
      if (!Number.isInteger(item.durationMs) || item.durationMs < min || item.durationMs > max) return false;
    }
  }
  playlist.name = name;
  playlist.default_duration_ms = duration;
  playlist.transition = transition;
  if (args.p_playback_mode === "auto" || args.p_playback_mode === "manual") {
    playlist.playback_mode = args.p_playback_mode;
  } else if (playlist.playback_mode == null) {
    playlist.playback_mode = "auto";
  }
  playlist.updated_at = new Date().toISOString();
  store.playlist_items = store.playlist_items.filter((item) => !(item.playlist_id === playlist.id && item.kind === "draft"));
  items.forEach((item, index) => {
    store.playlist_items.push({
      id: crypto.randomUUID(),
      playlist_id: playlist.id,
      account_id: playlist.account_id,
      media_id: item.mediaId,
      kind: "draft",
      position: index,
      duration_ms: item.durationMs ?? null,
      created_at: new Date().toISOString(),
    });
  });
  return true;
}

function publishPlaylist(store: Store, args: Record<string, unknown>) {
  const playlist = store.playlists.find((item) => item.id === args.p_playlist_id && item.account_id === args.p_account_id);
  const displayIds = Array.isArray(args.p_display_ids) ? args.p_display_ids as string[] : [];
  if (!playlist || displayIds.length < 1 || displayIds.length > 50) return false;
  const displays = displayIds.map((id) => store.displays.find((item) => item.id === id && item.account_id === args.p_account_id && item.status === "active"));
  if (displays.some((item) => !item)) return false;
  const draft = store.playlist_items
    .filter((item) => item.playlist_id === playlist.id && item.kind === "draft")
    .sort((a, b) => Number(a.position) - Number(b.position));
  if (!draft.length) return false;
  store.playlist_items = store.playlist_items.filter((item) => !(item.playlist_id === playlist.id && item.kind === "published"));
  for (const item of draft) {
    store.playlist_items.push({
      ...item,
      id: crypto.randomUUID(),
      kind: "published",
      duration_ms: item.duration_ms ?? playlist.default_duration_ms,
    });
  }
  const now = new Date().toISOString();
  playlist.published_at = now;
  playlist.published_transition = playlist.transition;
  playlist.published_playback_mode = playlist.playback_mode === "manual" ? "manual" : "auto";
  playlist.revision = Number(playlist.revision ?? 0) + 1;
  playlist.updated_at = now;
  const chosen = new Set(displayIds);
  for (const display of store.displays) {
    if (display.account_id !== args.p_account_id || display.status !== "active") continue;
    if (chosen.has(String(display.id))) {
      display.assigned_playlist_id = playlist.id;
      display.assigned_media_id = null;
      display.content_version = Number(display.content_version) + 1;
    } else if (display.assigned_playlist_id === playlist.id) {
      display.assigned_playlist_id = null;
      display.content_version = Number(display.content_version) + 1;
    }
  }
  return true;
}

function deletePlaylist(store: Store, args: Record<string, unknown>) {
  const index = store.playlists.findIndex((item) => item.id === args.p_playlist_id && item.account_id === args.p_account_id);
  if (index < 0) return false;
  for (const display of store.displays) {
    if (display.account_id === args.p_account_id && display.assigned_playlist_id === args.p_playlist_id) {
      display.assigned_playlist_id = null;
      display.content_version = Number(display.content_version) + 1;
    }
  }
  store.playlist_items = store.playlist_items.filter((item) => item.playlist_id !== args.p_playlist_id);
  store.schedules = store.schedules.filter((item) => item.playlist_id !== args.p_playlist_id);
  store.playlists.splice(index, 1);
  return true;
}

function snapshotPlaylist(store: Store, args: Record<string, unknown>) {
  const playlist = store.playlists.find((item) => item.id === args.p_playlist_id && item.account_id === args.p_account_id);
  if (!playlist) return false;
  const draft = store.playlist_items
    .filter((item) => item.playlist_id === playlist.id && item.kind === "draft")
    .sort((a, b) => Number(a.position) - Number(b.position));
  if (!draft.length) return false;
  const now = new Date().toISOString();
  store.playlist_items = store.playlist_items.filter((item) => !(item.playlist_id === playlist.id && item.kind === "published"));
  for (const item of draft) {
    store.playlist_items.push({
      id: crypto.randomUUID(),
      playlist_id: playlist.id,
      account_id: playlist.account_id,
      media_id: item.media_id,
      kind: "published",
      position: item.position,
      duration_ms: item.duration_ms ?? playlist.default_duration_ms,
      created_at: now,
    });
  }
  playlist.published_at = now;
  playlist.published_transition = playlist.transition;
  playlist.published_playback_mode = playlist.playback_mode === "manual" ? "manual" : "auto";
  playlist.revision = Number(playlist.revision ?? 0) + 1;
  playlist.updated_at = now;
  for (const display of store.displays) {
    if (display.account_id === args.p_account_id && display.status === "active" && display.assigned_playlist_id === playlist.id) {
      display.content_version = Number(display.content_version) + 1;
    }
  }
  return true;
}

function playerPlaylist(store: Store, args: Record<string, unknown>) {
  const display = store.displays.find((item) => item.token_hash === args.p_token_hash && item.status === "active");
  if (!display || !display.assigned_playlist_id || display.assigned_media_id) return [];
  const playlist = store.playlists.find((item) => item.id === display.assigned_playlist_id);
  if (!playlist) return [];
  return store.playlist_items
    .filter((item) => item.playlist_id === playlist.id && item.kind === "published")
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((item) => {
      const media = store.media.find((row) => row.id === item.media_id);
      return {
        playlist_id: playlist.id,
        transition: playlist.published_transition,
        playback_mode: playlist.published_playback_mode === "manual" ? "manual" : "auto",
        position: item.position,
        media_id: item.media_id,
        storage_path: media?.storage_path ?? null,
        duration_ms: item.duration_ms,
        kind: media?.kind === "video" ? "video" : media?.kind === "presentation" ? "presentation" : "image",
        width: media?.width ?? null,
        height: media?.height ?? null,
        media_duration_ms: media?.duration_ms ?? null,
      };
    });
}

export function createFakeDb() {
  const store: Store = {
    accounts: [],
    locations: [],
    media: [],
    displays: [],
    playlists: [],
    playlist_items: [],
    pairing_sessions: [],
    rate_limits: [],
    screen_groups: [],
    screen_group_members: [],
    schedules: [],
    promos: [],
    display_playback: [],
    display_commands: [],
    menus: [],
    objects: new Map(),
    objectTimes: new Map(),
    users: new Map(),
  };

  const client = {
    auth: {
      async getUser(jwt: string) {
        const user = store.users.get(jwt);
        if (!user) return { data: { user: null }, error: { message: "invalid session" } };
        return { data: { user: { id: user.id, email: user.email } }, error: null };
      },
    },
    from(table: string) {
      if (!isTable(table)) throw new Error(`Unknown table ${table}`);
      return new Query(store, table);
    },
    async rpc(name: string, args: Record<string, unknown> = {}) {
      try {
        return { data: rpc(store, name, args), error: null };
      } catch (error) {
        return { data: null, error: { message: (error as Error).message } };
      }
    },
    storage: {
      from() {
        return {
          async upload(path: string, body: Uint8Array | Blob) {
            // Supabase Storage replies HTTP 400 with statusCode "409" when upsert is false.
            if (store.objects.has(path)) {
              return {
                data: null,
                error: { message: "The resource already exists", status: 400, statusCode: "409", error: "Duplicate" },
              };
            }
            const bytes = body instanceof Uint8Array ? body : new Uint8Array(await body.arrayBuffer());
            store.objects.set(path, Uint8Array.from(bytes));
            if (!store.objectTimes.has(path)) store.objectTimes.set(path, new Date().toISOString());
            return { data: { path }, error: null };
          },
          async download(path: string) {
            const bytes = store.objects.get(path);
            if (!bytes) return { data: null, error: { message: "not found" } };
            return { data: new Blob([Uint8Array.from(bytes)]), error: null };
          },
          async createSignedUploadUrl(path: string) {
            const token = "upload-token";
            return {
              data: {
                signedUrl: `https://signed.test/upload/${encodeURIComponent(path)}?token=${token}`,
                path,
                token,
              },
              error: null,
            };
          },
          async remove(paths: string[]) {
            for (const path of paths) {
              store.objects.delete(path);
              store.objectTimes.delete(path);
            }
            return { data: paths, error: null };
          },
          async list(prefix = "", options?: { limit?: number; offset?: number }) {
            const limit = options?.limit ?? 100;
            const offset = options?.offset ?? 0;
            const normalized = prefix.replace(/^\/+|\/+$/g, "");
            const folders = new Map<string, { name: string; id: null; created_at: null; updated_at: null; metadata: null }>();
            const files: { name: string; id: string; created_at: string | null; updated_at: string | null; metadata: { size: number } }[] = [];
            for (const path of store.objects.keys()) {
              let rest = path;
              if (normalized) {
                const lead = `${normalized}/`;
                if (!path.startsWith(lead)) continue;
                rest = path.slice(lead.length);
              }
              if (!rest) continue;
              const slash = rest.indexOf("/");
              if (slash === -1) {
                const created = store.objectTimes.has(path) ? store.objectTimes.get(path) ?? null : new Date().toISOString();
                files.push({
                  name: rest,
                  id: path,
                  created_at: created,
                  updated_at: created,
                  metadata: { size: store.objects.get(path)?.byteLength ?? 0 },
                });
              } else {
                const name = rest.slice(0, slash);
                if (name) folders.set(name, { name, id: null, created_at: null, updated_at: null, metadata: null });
              }
            }
            const all = [...folders.values(), ...files].sort((a, b) => a.name.localeCompare(b.name));
            return { data: all.slice(offset, offset + limit), error: null };
          },
          async createSignedUrl(path: string, ttl: number) {
            if (!store.objects.has(path)) return { data: null, error: { message: "not found" } };
            return { data: { signedUrl: `https://signed.test/${encodeURIComponent(path)}?ttl=${ttl}` }, error: null };
          },
          async createSignedUrls(paths: string[], ttl: number) {
            return {
              data: paths.map((path) => ({
                path,
                signedUrl: store.objects.has(path) ? `https://signed.test/${encodeURIComponent(path)}?ttl=${ttl}` : null,
              })),
              error: null,
            };
          },
        };
      },
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    store,
    addUser(token: string, id: string, email: string) {
      store.users.set(token, { id, email });
    },
  };
}
