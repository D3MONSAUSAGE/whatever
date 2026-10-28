import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Mode = "many" | "single" | "maybe";

export type Store = {
  accounts: Row[];
  locations: Row[];
  media: Row[];
  displays: Row[];
  pairing_sessions: Row[];
  rate_limits: Row[];
  objects: Map<string, Uint8Array>;
  users: Map<string, { id: string; email: string }>;
};

const TABLE_NAMES = ["accounts", "locations", "media", "displays", "pairing_sessions", "rate_limits"] as const;
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
  if (!row.created_at) row.created_at = new Date().toISOString();
  if (table === "pairing_sessions" && !row.status) row.status = "pending";
  if (table === "displays") {
    if (!row.status) row.status = "active";
    if (row.content_version == null) row.content_version = 0;
  }
  store[table].push(row);
  return { row, error: null as null };
}

class Query implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> {
  private op: {
    type: "select" | "insert" | "update";
    select?: string;
    filters: [string, unknown][];
    order?: { col: string; ascending: boolean };
    insert?: Row;
    update?: Row;
    mode: Mode;
  };
  private done: Promise<{ data: unknown; error: { message: string; code?: string } | null }> | null = null;

  constructor(private store: Store, private table: TableName) {
    this.op = { type: "select", filters: [], mode: "many" };
  }

  select(cols = "*") {
    this.op.select = String(cols);
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
  eq(key: string, value: unknown) {
    this.op.filters.push([key, value]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.op.order = { col, ascending: opts?.ascending !== false };
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
    const match = () => rows.filter((row) => this.op.filters.every(([key, value]) => row[key] === value));

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

    let found = match().map((row) => project(this.store, row, this.op.select));
    if (this.op.order) {
      const { col, ascending } = this.op.order;
      found = found.sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (ascending ? 1 : -1));
    }
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
    store.locations.push({ id: crypto.randomUUID(), account_id: id, name: "Main location", created_at: now });
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
    if (args.p_media_id != null && !store.media.some((item) => item.id === args.p_media_id && item.account_id === args.p_account_id)) {
      return false;
    }
    const display = store.displays.find((item) =>
      item.id === args.p_display_id && item.account_id === args.p_account_id && item.status === "active");
    if (!display) return false;
    display.assigned_media_id = args.p_media_id;
    display.content_version = Number(display.content_version) + 1;
    return true;
  }
  if (name === "delete_media") {
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
  throw new Error(`Unknown rpc ${name}`);
}

export function createFakeDb() {
  const store: Store = {
    accounts: [],
    locations: [],
    media: [],
    displays: [],
    pairing_sessions: [],
    rate_limits: [],
    objects: new Map(),
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
          async upload(path: string, body: Uint8Array) {
            if (store.objects.has(path)) return { data: null, error: { message: "already exists" } };
            store.objects.set(path, new Uint8Array(body));
            return { data: { path }, error: null };
          },
          async remove(paths: string[]) {
            for (const path of paths) store.objects.delete(path);
            return { data: paths, error: null };
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
